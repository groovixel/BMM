<?php
if (!defined('ABSPATH')) { exit; }

function bds_install() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$wpdb->prefix}bds_bookings (
        id varchar(36) NOT NULL,
        user_id bigint(20) unsigned NOT NULL DEFAULT 0,
        stay_slug varchar(120) NOT NULL,
        status varchar(20) NOT NULL,
        check_in date NOT NULL,
        check_out date NOT NULL,
        created_at datetime NOT NULL,
        data longtext NOT NULL,
        PRIMARY KEY  (id),
        KEY user_id (user_id),
        KEY availability (stay_slug,status,check_in,check_out)
    ) $charset;");
    dbDelta("CREATE TABLE {$wpdb->prefix}bds_enquiries (
        id varchar(36) NOT NULL,
        type varchar(40) NOT NULL,
        created_at datetime NOT NULL,
        data longtext NOT NULL,
        PRIMARY KEY  (id)
    ) $charset;");
    update_option('bds_db_version', '2.0.0');
}
add_action('plugins_loaded', function () {
    if (get_option('bds_db_version') !== '2.0.0') { bds_install(); }
});
add_action('init', function () {
    register_post_type('bds_upload', array('public' => false, 'show_ui' => false, 'label' => 'Private BDS uploads'));
});

function bds_error($message, $status = 422) {
    return new WP_REST_Response(array('detail' => $message), $status);
}
function bds_limit($bucket, $max = 15) {
    $key = 'bds_rl_' . hash('sha256', $bucket . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'local'));
    $count = (int) get_transient($key);
    if ($count >= $max) { return false; }
    set_transient($key, $count + 1, 15 * MINUTE_IN_SECONDS);
    return true;
}
function bds_user() {
    $token = $_COOKIE['bds_session'] ?? '';
    if (is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token)) {
        $session = get_transient('bds_session_' . hash('sha256', $token));
        $account = is_array($session) ? get_userdata((int) $session['id']) : false;
        if ($account && hash_equals($session['password_hash'], hash('sha256', $account->user_pass))) { return $account; }
    }
    return is_user_logged_in() ? wp_get_current_user() : false;
}
function bds_user_data($user) {
    return array('user_id' => (string) $user->ID, 'name' => $user->display_name,
        'email' => $user->user_email, 'picture' => '',
        'role' => user_can($user, 'manage_options') ? 'admin' : 'guest');
}
function bds_session($user) {
    $old = $_COOKIE['bds_session'] ?? '';
    if (is_string($old) && preg_match('/^[a-f0-9]{64}$/', $old)) {
        delete_transient('bds_session_' . hash('sha256', $old));
    }
    $token = bin2hex(random_bytes(32));
    set_transient('bds_session_' . hash('sha256', $token), array('id' => $user->ID, 'password_hash' => hash('sha256', $user->user_pass)), 7 * DAY_IN_SECONDS);
    setcookie('bds_session', $token, array('expires' => time() + 7 * DAY_IN_SECONDS,
        'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
}
function bds_permission($request) {
    if ($request->get_method() !== 'GET') {
        if ($request->get_header('X-BDS-Request') !== '1') {
            return new WP_Error('bds_csrf', 'Please reload the page and try again.', array('status' => 403));
        }
        $origin = $request->get_header('Origin');
        $home = wp_parse_url(home_url());
        $source = wp_parse_url($origin);
        if ($origin && (!$source || strtolower($source['host'] ?? '') !== strtolower($home['host'] ?? '')
            || ($source['scheme'] ?? '') !== ($home['scheme'] ?? '')
            || ($source['port'] ?? null) !== ($home['port'] ?? null))) {
            return new WP_Error('bds_origin', 'This request must come from the site.', array('status' => 403));
        }
    }
    $route = $request->get_route();
    $user = bds_user();
    if (strpos($route, '/admin/') !== false || strpos($route, '/files/') !== false) {
        if (!$user || !user_can($user, 'manage_options')) {
            return new WP_Error('bds_forbidden', 'Owner access required.', array('status' => 403));
        }
    }
    if (strpos($route, '/stays/bookings') !== false && !$user) {
        return new WP_Error('bds_auth', 'Please sign in to continue.', array('status' => 401));
    }
    return true;
}
function bds_clean($input) {
    $out = array();
    foreach ($input as $key => $value) {
        if (is_scalar($value) || $value === null) {
            $out[sanitize_key($key)] = is_bool($value) ? $value : sanitize_textarea_field(substr((string) $value, 0, 6000));
        }
    }
    return $out;
}
function bds_stays() {
    return array_map(function ($stay) { return array('slug'=>$stay['slug'], 'name'=>$stay['name'], 'guests'=>max(1,(int)($stay['guests']??1)), 'nightly'=>(int)preg_replace('/[^0-9]/','',$stay['price']??'0'), 'min_nights'=>max(1,(int)($stay['minNights']??1))); }, bds_content_rows('bds_stay'));
}
function bds_lock($slug) {
    global $wpdb;
    $key = 'bds_lock_' . md5($slug);
    $token = time() . ':' . wp_generate_uuid4();
    for ($i = 0; $i < 20; $i++) {
        if (add_option($key, $token, '', false)) { return array($key, $token); }
        $old = get_option($key);
        if ($old && (int) $old < time() - 60) {
            $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, $old));
            wp_cache_delete($key, 'options');
        }
        usleep(100000);
    }
    return false;
}
function bds_unlock($lock) {
    global $wpdb;
    $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $lock[0], $lock[1]));
    wp_cache_delete($lock[0], 'options');
}
function bds_overlap($slug, $in, $out, $exclude = '') {
    global $wpdb;
    return $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}bds_bookings WHERE stay_slug = %s AND status = 'confirmed' AND check_in < %s AND check_out > %s AND id <> %s LIMIT 1", $slug, $out, $in, $exclude));
}
function bds_booking_row($row) {
    if (!$row) { return null; }
    $data = json_decode($row['data'], true);
    $data['status'] = $row['status'];
    return $data;
}
function bds_notify($data, $subject, $guest = false) {
    $lines = array();
    foreach ($data as $key => $value) {
        if (is_scalar($value) && !in_array($key, array('user_id', 'file_id'), true)) {
            $lines[] = ucwords(str_replace('_', ' ', $key)) . ': ' . $value;
        }
    }
    $form = !empty($data['form_slug']) ? bds_form_config($data['form_slug']) : null;
    $owner = is_email($form['notification_email'] ?? '') ? $form['notification_email'] : get_option('bds_notification_email', get_option('admin_email'));
    wp_mail($owner, $subject, implode("\n", $lines), array('Reply-To: ' . sanitize_email($data['email'] ?? $owner)));
    if ($guest && is_email($data['email'] ?? '')) {
        $url = home_url('/#/stays/trips/' . $data['id']);
        // The companion theme uses clean paths; shortcode embeds use hash paths.
        if (get_option('stylesheet') === 'bds-marvel-theme') { $url = home_url('/stays/trips/' . $data['id']); }
        wp_mail($data['email'], $subject, implode("\n", $lines) . "\n\nView your trip: " . $url);
    }
}
function bds_create_booking($request) {
    global $wpdb;
    if (!bds_limit('bookings', 30)) { return bds_error('Too many booking attempts. Try again later.', 429); }
    $data = bds_clean($request->get_json_params() ?: array());
    $catalogue = bds_stays();
    $stay = null;
    foreach ($catalogue as $item) {
        if (($data['stay_slug'] ?? '') === $item['slug'] || ($data['stay'] ?? '') === $item['name']) { $stay = $item; break; }
    }
    if (!$stay) { return bds_error('Stay not found.', 404); }
    $in = DateTimeImmutable::createFromFormat('!Y-m-d', $data['check_in'] ?? '');
    $out = DateTimeImmutable::createFromFormat('!Y-m-d', $data['check_out'] ?? '');
    if (!$in || !$out || $in->format('Y-m-d') !== ($data['check_in'] ?? '') || $out->format('Y-m-d') !== ($data['check_out'] ?? '')
        || $in->format('Y-m-d') < current_time('Y-m-d') || $out <= $in) { return bds_error('Choose valid future dates, with checkout after check-in.'); }
    $legacy = $request->get_route() === '/bds/v1/bookings';
    $adults = filter_var($data['adults'] ?? ($legacy ? ($data['guests'] ?? 1) : 0), FILTER_VALIDATE_INT);
    $children = filter_var($data['children'] ?? 0, FILTER_VALIDATE_INT);
    $infants = filter_var($data['infants'] ?? 0, FILTER_VALIDATE_INT);
    $pets = filter_var($data['pets'] ?? 0, FILTER_VALIDATE_INT);
    if ($adults === false || $children === false || $infants === false || $pets === false || $adults < 1 || $children < 0 || $infants < 0 || $pets < 0
        || $infants > 5 || $pets > 5 || $adults + $children > $stay['guests']) { return bds_error('Please check the guest counts and capacity.'); }
    if (empty($data['name']) || !is_email($data['email'] ?? '') || (!$legacy && strlen(preg_replace('/\D/', '', $data['phone'] ?? '')) < 7)) { return bds_error('Enter your name, valid email and phone number.'); }
    $mode = $legacy ? 'request' : ($data['mode'] ?? 'request');
    if (!in_array($mode, array('instant', 'request'), true)) { return bds_error('Invalid booking mode.'); }
    $user = bds_user();
    $nights = (int) $in->diff($out)->days;
    if ($nights < ($stay['min_nights'] ?? 1)) { return bds_error('This stay requires at least ' . $stay['min_nights'] . ' nights.'); }
    if ($nights > 365) { return bds_error('Please contact the host for stays longer than one year.'); }
    $data = array_merge($data, array('id' => wp_generate_uuid4(), 'reference' => 'BDS-' . strtoupper(bin2hex(random_bytes(3))),
        'user_id' => $user ? (string) $user->ID : '0', 'stay' => $stay['name'], 'stay_slug' => $stay['slug'],
        'mode' => $mode, 'status' => $mode === 'instant' ? 'confirmed' : 'requested', 'nights' => $nights,
        'adults' => $adults, 'children' => $children, 'infants' => $infants, 'pets' => $pets, 'guests' => $adults + $children,
        'nightly' => $stay['nightly'], 'total' => $stay['nightly'] * $nights, 'created_at' => gmdate('c')));
    unset($data['capacity']);
    $lock = bds_lock($stay['slug']);
    if (!$lock) { return bds_error('Another reservation is being processed. Please try again.', 409); }
    try {
        if (bds_overlap($stay['slug'], $data['check_in'], $data['check_out'])) { return bds_error('Those nights are already booked. Please choose different dates.', 409); }
        $saved = $wpdb->insert($wpdb->prefix . 'bds_bookings', array('id' => $data['id'], 'user_id' => $user ? $user->ID : 0,
            'stay_slug' => $stay['slug'], 'status' => $data['status'], 'check_in' => $data['check_in'], 'check_out' => $data['check_out'],
            'created_at' => current_time('mysql', true), 'data' => wp_json_encode($data)));
        if (!$saved) { return bds_error('The booking could not be saved. Please try again.', 500); }
    } finally { bds_unlock($lock); }
    bds_notify($data, 'BDS Marvel — booking ' . $data['status'] . ' (' . $data['reference'] . ')', true);
    return new WP_REST_Response($data, 201);
}
function bds_update_booking($request) {
    global $wpdb;
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}bds_bookings WHERE id = %s", $request['id']), ARRAY_A);
    if (!$row) { return bds_error('Booking not found.', 404); }
    $status = $request->get_param('status');
    if (!in_array($status, array('requested', 'confirmed', 'declined', 'cancelled'), true)) { return bds_error('Invalid booking status.'); }
    $lock = bds_lock($row['stay_slug']);
    if (!$lock) { return bds_error('Please try again in a moment.', 409); }
    try {
        if ($status === 'confirmed' && bds_overlap($row['stay_slug'], $row['check_in'], $row['check_out'], $row['id'])) { return bds_error('Those dates are already confirmed for another guest.', 409); }
        if ($wpdb->update($wpdb->prefix . 'bds_bookings', array('status' => $status), array('id' => $row['id'])) === false) { return bds_error('Could not update booking.', 500); }
    } finally { bds_unlock($lock); }
    $row['status'] = $status;
    $data = bds_booking_row($row);
    bds_notify($data, 'BDS Marvel — booking ' . $status . ' (' . $data['reference'] . ')', true);
    return $data;
}
function bds_api($request) {
    global $wpdb;
    $path = substr($request->get_route(), strlen('/bds/v1'));
    $method = $request->get_method();
    $input = $request->get_json_params() ?: array();
    if (!is_array($input)) { return bds_error('Invalid request body.', 400); }
    $user = bds_user();
    if (in_array($path, array('/auth/register', '/auth/login'), true)) {
        if (!bds_limit('auth', 30)) { return bds_error('Too many attempts. Try again later.', 429); }
        $email = is_string($input['email'] ?? null) ? sanitize_email($input['email']) : '';
        $password = $input['password'] ?? '';
        if (!is_email($email) || !is_string($password) || strlen($password) > 4096) { return bds_error('Enter a valid email and password.'); }
        if ($path === '/auth/register') {
            if (!get_option('bds_allow_registration', 1)) { return bds_error('New account registration is currently closed.', 403); }
            $name = is_string($input['name'] ?? null) ? sanitize_text_field($input['name']) : '';
            if (!$name || strlen($password) < 8) { return bds_error('Enter your name and a password of at least eight characters.'); }
            if (email_exists($email)) { return bds_error('Unable to create this account. Try signing in or resetting your password.', 409); }
            $id = wp_insert_user(array('user_login' => 'bds_' . wp_generate_password(24, false), 'user_email' => $email,
                'user_pass' => $password, 'display_name' => $name, 'role' => 'subscriber'));
            if (is_wp_error($id)) { return bds_error('Unable to create this account.', 409); }
            $user = get_userdata($id);
        } else {
            $user = wp_authenticate($email, $password);
            if (is_wp_error($user)) { return bds_error('Email or password is incorrect.', 401); }
        }
        bds_session($user);
        return bds_user_data($user);
    }
    if ($path === '/auth/status') { return array('user' => $user ? bds_user_data($user) : null); }
    if ($path === '/auth/me') { return $user ? bds_user_data($user) : bds_error('Please sign in.', 401); }
    if ($path === '/auth/logout') {
        $token = $_COOKIE['bds_session'] ?? '';
        if (is_string($token)) { delete_transient('bds_session_' . hash('sha256', $token)); }
        setcookie('bds_session', '', array('expires' => time() - 3600, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
        if (is_user_logged_in()) { wp_logout(); }
        return array('ok' => true);
    }
    if ($path === '/stays/availability') {
        $rows = $wpdb->get_results("SELECT stay_slug,status,check_in,check_out FROM {$wpdb->prefix}bds_bookings WHERE status IN ('confirmed','requested')", ARRAY_A);
        $result = array('booked' => array(), 'requested' => array());
        $filter = $request->get_param('stay');
        $stays = bds_stays();
        foreach ($rows as $row) {
            $stay = null;
            foreach ($stays as $item) { if ($item['slug'] === $row['stay_slug']) { $stay = $item; break; } }
            if (!$stay || ($filter && $filter !== $stay['name'] && $filter !== $stay['slug'])) { continue; }
            $result[$row['status'] === 'confirmed' ? 'booked' : 'requested'][] = array('stay' => $stay['name'], 'check_in' => $row['check_in'], 'check_out' => $row['check_out']);
        }
        return $result;
    }
    if ($path === '/bookings' || ($path === '/stays/bookings' && $method === 'POST')) { return bds_create_booking($request); }
    if ($path === '/stays/bookings/mine') {
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}bds_bookings WHERE user_id = %d ORDER BY created_at DESC LIMIT 200", $user->ID), ARRAY_A);
        return array_map('bds_booking_row', $rows);
    }
    if (preg_match('#^/stays/bookings/([^/]+)$#', $path, $m)) {
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}bds_bookings WHERE id = %s AND user_id = %d", $m[1], $user->ID), ARRAY_A);
        return $row ? bds_booking_row($row) : bds_error('Booking not found.', 404);
    }
    if ($path === '/admin/bookings') { return array_map('bds_booking_row', $wpdb->get_results("SELECT * FROM {$wpdb->prefix}bds_bookings ORDER BY created_at DESC LIMIT 500", ARRAY_A)); }
    if (preg_match('#^/admin/bookings/([^/]+)/status$#', $path)) { return bds_update_booking($request); }
    if ($path === '/admin/enquiries') {
        $rows = $wpdb->get_col("SELECT data FROM {$wpdb->prefix}bds_enquiries ORDER BY created_at DESC LIMIT 500");
        return array_map(function ($row) { return json_decode($row, true); }, $rows);
    }
    if ($path === '/admin/overview') {
        return array('pending_requests' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}bds_bookings WHERE status = 'requested'"),
            'upcoming_stays' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}bds_bookings WHERE status = 'confirmed' AND check_out >= %s", current_time('Y-m-d'))),
            'total_bookings' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}bds_bookings"),
            'total_enquiries' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}bds_enquiries"));
    }
    if ($path === '/consultations/upload') {
        if (!bds_limit('upload', 10)) { return bds_error('Too many uploads. Try again later.', 429); }
        $file = $request->get_file_params()['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * MB_IN_BYTES || !is_uploaded_file($file['tmp_name'])) { return bds_error('Choose an image or PDF smaller than 5 MB.'); }
        $mimes = array('jpg|jpeg' => 'image/jpeg', 'png' => 'image/png', 'pdf' => 'application/pdf');
        $check = wp_check_filetype_and_ext($file['tmp_name'], $file['name'], $mimes);
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $actual = $finfo->file($file['tmp_name']);
        if (empty($check['type']) || $actual !== $check['type']) { return bds_error('Only JPG, PNG and PDF files are accepted.'); }
        $id = wp_generate_uuid4();
        $post = wp_insert_post(array('post_type' => 'bds_upload', 'post_status' => 'private', 'post_name' => $id,
            'post_title' => sanitize_file_name($file['name']), 'post_content' => base64_encode(file_get_contents($file['tmp_name']))), true);
        if (is_wp_error($post) || !$post) { return bds_error('Upload could not be saved.', 500); }
        update_post_meta($post, '_bds_mime', $actual);
        return array('id' => $id, 'filename' => sanitize_file_name($file['name']));
    }
    if (preg_match('#^/files/([^/]+)$#', $path, $m)) {
        $posts = get_posts(array('post_type' => 'bds_upload', 'post_status' => 'private', 'name' => $m[1], 'numberposts' => 1));
        if (!$posts) { return bds_error('File not found.', 404); }
        $post = $posts[0];
        return new WP_REST_Response(array('bds_private_file' => $post->ID));
    }
    $types = array('/inquiries' => 'Contact', '/consultations' => 'Consultation', '/sample-requests' => 'Sample request', '/product-inquiries' => 'Product inquiry', '/quote-requests' => 'Quote request');
    if (isset($types[$path])) {
        if (!bds_limit('enquiries', 20)) { return bds_error('Too many requests. Try again later.', 429); }
        if (strlen($request->get_body()) > 50000) { return bds_error('Please shorten the request.', 413); }
        $data = bds_clean($input);
        if (empty($data['name']) || !is_email($data['email'] ?? '')) { return bds_error('Enter your name and a valid email address.'); }
        $config=bds_form_config(ltrim($path,'/'));
        if (!$config || empty($config['enabled'])) { return bds_error('This form is currently unavailable.',410); }
        foreach($config['fields']??array() as $field) {
            if(empty($field['enabled'])||empty($field['required'])){continue;}
            if(($field['type']??'')==='file'){if(empty($data['file_id'])){return bds_error('Please attach the required file.');}continue;}
            $key=sanitize_key($field['name']);
            if(!isset($data[$key])||trim((string)$data[$key])===''||($field['type']==='checkbox'&&!$data[$key])){return bds_error('Please complete: '.sanitize_text_field($field['label']));}
        }
        $data['form_slug'] = ltrim($path, '/');
        $data['id'] = wp_generate_uuid4(); $data['type'] = $types[$path]; $data['created_at'] = gmdate('c');
        if (!$wpdb->insert($wpdb->prefix . 'bds_enquiries', array('id' => $data['id'], 'type' => $data['type'], 'created_at' => current_time('mysql', true), 'data' => wp_json_encode($data)))) { return bds_error('Could not save your enquiry. Please try again.', 500); }
        bds_notify($data, 'BDS Marvel — ' . $data['type']);
        return new WP_REST_Response($data, 201);
    }
    return bds_error('Not found.', 404);
}
add_action('rest_api_init', function () {
    $routes = array(
        '/auth/register' => 'POST', '/auth/login' => 'POST', '/auth/logout' => 'POST', '/auth/status' => 'GET', '/auth/me' => 'GET',
        '/stays/availability' => 'GET', '/stays/bookings' => 'POST', '/stays/bookings/mine' => 'GET',
        '/stays/bookings/(?P<id>[a-f0-9-]{36})' => 'GET', '/bookings' => 'POST',
        '/admin/overview' => 'GET', '/admin/bookings' => 'GET', '/admin/enquiries' => 'GET',
        '/admin/bookings/(?P<id>[a-f0-9-]{36})/status' => 'POST', '/inquiries' => 'POST', '/consultations' => 'POST',
        '/consultations/upload' => 'POST', '/files/(?P<id>[a-f0-9-]{36})' => 'GET', '/sample-requests' => 'POST', '/product-inquiries' => 'POST', '/quote-requests' => 'POST');
    foreach ($routes as $route => $method) { register_rest_route('bds/v1', $route, array('methods' => $method, 'callback' => 'bds_api', 'permission_callback' => 'bds_permission')); }
});
add_filter('rest_post_dispatch', function ($response, $server, $request) {
    if (strpos($request->get_route(), '/bds/v1/') === 0) {
        $response->header('Cache-Control', 'no-store, private');
        $response->header('Vary', 'Cookie');
    }
    return $response;
}, 10, 3);
add_filter('rest_pre_serve_request', function ($served, $result, $request) {
    if (strpos($request->get_route(), '/bds/v1/files/') !== 0 || !($result instanceof WP_REST_Response)) { return $served; }
    $data = $result->get_data();
    if (empty($data['bds_private_file'])) { return $served; }
    $post = get_post($data['bds_private_file']);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . sanitize_file_name($post->post_title) . '"');
    header('X-Content-Type-Options: nosniff');
    echo base64_decode($post->post_content);
    return true;
}, 10, 3);
