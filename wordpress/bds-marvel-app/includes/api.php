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
    if ((strpos($route, '/stays/bookings') !== false || strpos($route, '/stays/payments') !== false) && !$user) {
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
    return array_map(function ($stay) { return array('slug'=>$stay['slug'], 'name'=>$stay['name'], 'guests'=>max(1,(int)($stay['guests']??1)), 'nightly'=>(int)preg_replace('/[^0-9]/','',$stay['price']??'0'), 'min_nights'=>max(1,(int)($stay['minNights']??1)), 'booking_mode'=>($stay['bookingMode']??'request')==='instant'?'instant':'request'); }, bds_content_rows('bds_stay'));
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
function bds_active_overlap($slug, $in, $out, $exclude = '') {
    global $wpdb;
    $cutoff = gmdate('Y-m-d H:i:s', time() - 15 * MINUTE_IN_SECONDS);
    return $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}bds_bookings WHERE stay_slug = %s AND (status = 'confirmed' OR (status = 'payment_pending' AND created_at >= %s)) AND check_in < %s AND check_out > %s AND id <> %s LIMIT 1", $slug, $cutoff, $out, $in, $exclude));
}
function bds_razorpay_credentials() {
    $key = trim((string) get_option('bds_razorpay_key_id', ''));
    $secret = trim((string) get_option('bds_razorpay_key_secret', ''));
    return ($key && $secret) ? array($key, $secret) : false;
}
function bds_razorpay_request($method, $path, $body = null) {
    $credentials = bds_razorpay_credentials();
    if (!$credentials) { return new WP_Error('bds_razorpay_config', 'Razorpay is not configured.'); }
    $args = array('method' => $method, 'timeout' => 20, 'redirection' => 0,
        'headers' => array('Authorization' => 'Basic ' . base64_encode($credentials[0] . ':' . $credentials[1]), 'Content-Type' => 'application/json', 'Accept' => 'application/json'));
    if ($body !== null) { $args['body'] = wp_json_encode($body); }
    return wp_remote_request('https://api.razorpay.com/v1/' . ltrim($path, '/'), $args);
}
function bds_razorpay_result($response) {
    if (is_wp_error($response)) { return false; }
    $code = wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);
    return ($code >= 200 && $code < 300 && is_array($data)) ? $data : false;
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
    // Confirmation is a listing policy controlled in WordPress, never by the
    // guest's request payload.
    $mode = $stay['booking_mode'];
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
function bds_create_stay_payment_order($request) {
    global $wpdb;
    if (!bds_limit('stay_payment_orders', 10)) { return bds_error('Too many payment attempts. Please try again later.', 429); }
    $input = bds_clean($request->get_json_params() ?: array());
    $stay = null;
    foreach (bds_stays() as $item) { if (($input['stay_slug'] ?? '') === $item['slug']) { $stay = $item; break; } }
    if (!$stay) { return bds_error('Stay not found.', 404); }
    $in = DateTimeImmutable::createFromFormat('!Y-m-d', $input['check_in'] ?? '');
    $out = DateTimeImmutable::createFromFormat('!Y-m-d', $input['check_out'] ?? '');
    if (!$in || !$out || $in->format('Y-m-d') !== ($input['check_in'] ?? '') || $out->format('Y-m-d') !== ($input['check_out'] ?? '')
        || $in->format('Y-m-d') < current_time('Y-m-d') || $out <= $in) { return bds_error('Choose valid future dates, with checkout after check-in.'); }
    $adults = filter_var($input['adults'] ?? null, FILTER_VALIDATE_INT);
    $children = filter_var($input['children'] ?? 0, FILTER_VALIDATE_INT);
    $infants = filter_var($input['infants'] ?? 0, FILTER_VALIDATE_INT);
    $pets = filter_var($input['pets'] ?? 0, FILTER_VALIDATE_INT);
    if ($adults === false || $adults < 1 || $children === false || $children < 0 || $infants === false || $infants < 0 || $infants > 5
        || $pets === false || $pets < 0 || $pets > 5 || $adults + $children > $stay['guests']) { return bds_error('Please check the guest counts and stay capacity.'); }
    if (empty($input['name']) || !is_email($input['email'] ?? '') || strlen(preg_replace('/\D/', '', $input['phone'] ?? '')) < 7) { return bds_error('Enter your name, valid email and phone number.'); }
    $nights = (int) $in->diff($out)->days;
    if ($nights < ($stay['min_nights'] ?? 1)) { return bds_error('This stay requires at least ' . $stay['min_nights'] . ' nights.'); }
    if ($nights > 365) { return bds_error('Please contact the host for stays longer than one year.'); }
    $user = bds_user();
    if (!$user) { return bds_error('Please sign in to continue.', 401); }
    $id = wp_generate_uuid4();
    $reference = 'BDS-' . strtoupper(bin2hex(random_bytes(3)));
    $total = (int) $stay['nightly'] * $nights;
    if ($total < 1) { return bds_error('This stay total is invalid. Please contact us.'); }
    $credentials = bds_razorpay_credentials();
    if (!$credentials) {
        // Keep bookings usable before Razorpay is configured, but never imply
        // that an unpaid request is an instant or confirmed reservation.
        $data = array('id' => $id, 'reference' => $reference, 'user_id' => (string) $user->ID,
            'stay' => $stay['name'], 'stay_slug' => $stay['slug'], 'mode' => 'request', 'status' => 'requested',
            'payment_status' => 'not_required', 'payment_provider' => '',
            'check_in' => $input['check_in'], 'check_out' => $input['check_out'], 'nights' => $nights,
            'adults' => $adults, 'children' => $children, 'infants' => $infants, 'pets' => $pets, 'guests' => $adults + $children,
            'nightly' => (int) $stay['nightly'], 'total' => $total, 'name' => sanitize_text_field($input['name']),
            'email' => sanitize_email($input['email']), 'phone' => sanitize_text_field($input['phone']),
            'message' => sanitize_textarea_field($input['message'] ?? ''), 'created_at' => gmdate('c'));
        $lock = bds_lock($stay['slug']);
        if (!$lock) { return bds_error('Another reservation is being processed. Please try again.', 409); }
        try {
            if (bds_active_overlap($stay['slug'], $input['check_in'], $input['check_out'])) { return bds_error('Those nights are no longer available. Please choose different dates.', 409); }
            $saved = $wpdb->insert($wpdb->prefix . 'bds_bookings', array('id' => $id, 'user_id' => $user->ID,
                'stay_slug' => $stay['slug'], 'status' => 'requested', 'check_in' => $input['check_in'], 'check_out' => $input['check_out'],
                'created_at' => current_time('mysql', true), 'data' => wp_json_encode($data)));
            if (!$saved) { return bds_error('The booking request could not be saved. Please try again.', 500); }
        } finally { bds_unlock($lock); }
        bds_notify($data, 'BDS Marvel — unpaid booking request (' . $data['reference'] . ')', true);
        return new WP_REST_Response(array('booking' => $data, 'payment_required' => false), 201);
    }
    if ($total > 100000000) { return bds_error('This stay amount cannot be paid online. Please contact us.'); }
    $order = array('amount' => $total * 100, 'currency' => 'INR', 'receipt' => 'bds_' . str_replace('-', '', $id),
        'notes' => array('booking_id' => $id, 'stay_slug' => $stay['slug'], 'booking_reference' => $reference));
    $lock = bds_lock($stay['slug']);
    if (!$lock) { return bds_error('Another reservation is being processed. Please try again.', 409); }
    try {
        if (bds_active_overlap($stay['slug'], $input['check_in'], $input['check_out'])) { return bds_error('Those nights are no longer available. Please choose different dates.', 409); }
        $remote = bds_razorpay_result(bds_razorpay_request('POST', 'orders', $order));
        if (!$remote || empty($remote['id']) || (int) ($remote['amount'] ?? 0) !== $order['amount'] || ($remote['currency'] ?? '') !== 'INR') {
            return bds_error('The payment service is temporarily unavailable. Please try again.', 502);
        }
        $data = array('id' => $id, 'reference' => $reference, 'user_id' => (string) $user->ID,
            'stay' => $stay['name'], 'stay_slug' => $stay['slug'], 'mode' => $stay['booking_mode'], 'status' => 'payment_pending',
            'payment_status' => 'pending', 'payment_provider' => 'razorpay', 'razorpay_order_id' => $remote['id'],
            'check_in' => $input['check_in'], 'check_out' => $input['check_out'], 'nights' => $nights,
            'adults' => $adults, 'children' => $children, 'infants' => $infants, 'pets' => $pets, 'guests' => $adults + $children,
            'nightly' => (int) $stay['nightly'], 'total' => $total, 'name' => sanitize_text_field($input['name']),
            'email' => sanitize_email($input['email']), 'phone' => sanitize_text_field($input['phone']),
            'message' => sanitize_textarea_field($input['message'] ?? ''), 'created_at' => gmdate('c'));
        $saved = $wpdb->insert($wpdb->prefix . 'bds_bookings', array('id' => $id, 'user_id' => $user->ID,
            'stay_slug' => $stay['slug'], 'status' => 'payment_pending', 'check_in' => $input['check_in'], 'check_out' => $input['check_out'],
            'created_at' => current_time('mysql', true), 'data' => wp_json_encode($data)));
        if (!$saved) { return bds_error('The booking could not be saved. Please try again.', 500); }
    } finally { bds_unlock($lock); }
    return new WP_REST_Response(array('booking' => $data, 'order_id' => $remote['id'], 'amount' => $order['amount'], 'currency' => 'INR', 'key_id' => $credentials[0], 'payment_required' => true), 201);
}
function bds_verify_stay_payment($request) {
    global $wpdb;
    if (!bds_razorpay_credentials()) { return bds_error('Online payment is not configured.', 503); }
    if (!bds_limit('stay_payment_verify', 30)) { return bds_error('Too many verification attempts. Please try again later.', 429); }
    $input = $request->get_json_params() ?: array();
    $id = sanitize_text_field($input['booking_id'] ?? '');
    $order_id = sanitize_text_field($input['razorpay_order_id'] ?? '');
    $payment_id = sanitize_text_field($input['razorpay_payment_id'] ?? '');
    $signature = sanitize_text_field($input['razorpay_signature'] ?? '');
    if (!preg_match('/^[a-f0-9-]{36}$/i', $id) || !preg_match('/^order_[A-Za-z0-9]+$/', $order_id)
        || !preg_match('/^pay_[A-Za-z0-9]+$/', $payment_id) || !preg_match('/^[a-f0-9]{64}$/i', $signature)) { return bds_error('Invalid payment verification details.', 400); }
    $user = bds_user();
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}bds_bookings WHERE id = %s AND user_id = %d", $id, $user->ID), ARRAY_A);
    if (!$row) { return bds_error('Payment order not found.', 404); }
    $data = json_decode($row['data'], true);
    if (!is_array($data) || ($data['razorpay_order_id'] ?? '') !== $order_id || ($data['payment_provider'] ?? '') !== 'razorpay') { return bds_error('Payment order does not match this stay.', 400); }
    $key = bds_razorpay_credentials();
    $expected = hash_hmac('sha256', $order_id . '|' . $payment_id, $key[1]);
    if (!hash_equals($expected, $signature)) { return bds_error('Payment signature could not be verified.', 400); }
    if (($data['payment_status'] ?? '') === 'paid') { return bds_booking_row($row); }
    $payment = bds_razorpay_result(bds_razorpay_request('GET', 'payments/' . rawurlencode($payment_id)));
    if (!$payment || ($payment['order_id'] ?? '') !== $order_id || (int) ($payment['amount'] ?? 0) !== (int) $data['total'] * 100 || ($payment['currency'] ?? '') !== 'INR') {
        return bds_error('Payment amount or order does not match this stay.', 400);
    }
    if (($payment['status'] ?? '') === 'authorized') {
        $payment = bds_razorpay_result(bds_razorpay_request('POST', 'payments/' . rawurlencode($payment_id) . '/capture', array('amount' => (int) $data['total'] * 100, 'currency' => 'INR')));
    }
    if (!$payment || ($payment['status'] ?? '') !== 'captured') { return bds_error('Razorpay has not confirmed this captured payment yet. Please retry shortly.', 409); }
    $lock = bds_lock($row['stay_slug']);
    if (!$lock) { return bds_error('Payment is received and being verified. Please retry shortly.', 409); }
    try {
        if (bds_active_overlap($row['stay_slug'], $row['check_in'], $row['check_out'], $id)) {
            $data['status'] = 'payment_conflict'; $data['payment_status'] = 'paid_conflict'; $data['payment_id'] = $payment_id;
            $wpdb->update($wpdb->prefix . 'bds_bookings', array('status' => 'payment_conflict', 'data' => wp_json_encode($data)), array('id' => $id));
            return bds_error('Payment was received, but these dates were just taken. Please contact BDS Marvel for a refund.', 409);
        }
        $data['status'] = $data['mode'] === 'instant' ? 'confirmed' : 'requested';
        $data['payment_status'] = 'paid'; $data['payment_id'] = $payment_id; $data['paid_at'] = gmdate('c');
        if ($wpdb->update($wpdb->prefix . 'bds_bookings', array('status' => $data['status'], 'data' => wp_json_encode($data)), array('id' => $id)) === false) { return bds_error('Payment was verified, but the booking needs owner review.', 500); }
    } finally { bds_unlock($lock); }
    bds_notify($data, 'BDS Marvel — ' . ($data['status'] === 'confirmed' ? 'paid reservation' : 'paid booking request') . ' (' . $data['reference'] . ')', true);
    $row['data'] = wp_json_encode($data); $row['status'] = $data['status'];
    return bds_booking_row($row);
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
        if ($status === 'confirmed' && bds_active_overlap($row['stay_slug'], $row['check_in'], $row['check_out'], $row['id'])) { return bds_error('Those dates are already reserved or being paid for another guest.', 409); }
        if ($wpdb->update($wpdb->prefix . 'bds_bookings', array('status' => $status), array('id' => $row['id'])) === false) { return bds_error('Could not update booking.', 500); }
    } finally { bds_unlock($lock); }
    $row['status'] = $status;
    $data = bds_booking_row($row);
    if ($status === 'declined' && ($data['payment_status'] ?? '') === 'paid' && !empty($data['payment_id'])) {
        $refund = bds_razorpay_result(bds_razorpay_request('POST', 'payments/' . rawurlencode($data['payment_id']) . '/refund', array(
            'amount' => (int) $data['total'] * 100, 'notes' => array('booking_reference' => $data['reference'], 'reason' => 'Stay request declined by host'))));
        if ($refund && !empty($refund['id'])) {
            $data['payment_status'] = 'refund_pending'; $data['refund_id'] = $refund['id']; $data['refund_requested_at'] = gmdate('c');
        } else {
            $data['payment_status'] = 'refund_failed'; $data['refund_attention'] = 'Owner must arrange guest refund';
        }
        $wpdb->update($wpdb->prefix . 'bds_bookings', array('data' => wp_json_encode($data)), array('id' => $row['id']));
    }
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
    if ($path === '/auth/session') {
        if (!bds_limit('google_auth', 15)) { return bds_error('Too many sign-in attempts. Try again later.', 429); }
        $session_id = $input['session_id'] ?? '';
        if (!is_string($session_id) || strlen($session_id) < 8 || strlen($session_id) > 2048 || preg_match('/[\r\n]/', $session_id)) {
            return bds_error('Google sign-in failed. Please try again.', 401);
        }
        $provider = wp_remote_get('https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data', array(
            'timeout' => 20,
            'redirection' => 0,
            'headers' => array('X-Session-ID' => $session_id, 'Accept' => 'application/json'),
        ));
        if (is_wp_error($provider) || wp_remote_retrieve_response_code($provider) !== 200) {
            return bds_error('Google sign-in failed. Please try again.', 401);
        }
        $identity = json_decode(wp_remote_retrieve_body($provider), true);
        $email = is_array($identity) && is_string($identity['email'] ?? null) ? sanitize_email($identity['email']) : '';
        if (!is_email($email) || !is_string($identity['session_token'] ?? null) || $identity['session_token'] === '') {
            return bds_error('Google sign-in failed. Please try again.', 401);
        }
        $user = get_user_by('email', $email);
        if (!$user) {
            if (!get_option('bds_allow_registration', 1)) { return bds_error('New account registration is currently closed.', 403); }
            $name = is_string($identity['name'] ?? null) ? sanitize_text_field($identity['name']) : '';
            $id = wp_insert_user(array(
                'user_login' => 'bds_' . wp_generate_password(24, false),
                'user_email' => $email,
                'user_pass' => wp_generate_password(48, true, true),
                'display_name' => $name ?: $email,
                'role' => 'subscriber',
            ));
            if (is_wp_error($id)) { return bds_error('Unable to create this account. Please try again.', 409); }
            $user = get_userdata($id);
        }
        if (is_string($identity['picture'] ?? null) && filter_var($identity['picture'], FILTER_VALIDATE_URL)) {
            update_user_meta($user->ID, 'bds_google_picture', esc_url_raw($identity['picture']));
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
        $pending_cutoff = gmdate('Y-m-d H:i:s', time() - 15 * MINUTE_IN_SECONDS);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT stay_slug,status,check_in,check_out FROM {$wpdb->prefix}bds_bookings WHERE status IN ('confirmed','requested') OR (status = 'payment_pending' AND created_at >= %s)", $pending_cutoff), ARRAY_A);
        $result = array('booked' => array(), 'requested' => array());
        $filter = $request->get_param('stay');
        $stays = bds_stays();
        foreach ($rows as $row) {
            $stay = null;
            foreach ($stays as $item) { if ($item['slug'] === $row['stay_slug']) { $stay = $item; break; } }
            if (!$stay || ($filter && $filter !== $stay['name'] && $filter !== $stay['slug'])) { continue; }
            $result[in_array($row['status'], array('confirmed', 'payment_pending'), true) ? 'booked' : 'requested'][] = array('stay' => $stay['name'], 'check_in' => $row['check_in'], 'check_out' => $row['check_out']);
        }
        return $result;
    }
    if ($path === '/stays/payments/orders' && $method === 'POST') { return bds_create_stay_payment_order($request); }
    if ($path === '/stays/payments/verify' && $method === 'POST') { return bds_verify_stay_payment($request); }
    if ($path === '/stays/bookings' && $method === 'POST') { return bds_error('Continue through secure online payment to reserve these dates.', 410); }
    if ($path === '/bookings') { return bds_error('Please choose a stay and continue through secure online payment.', 410); }
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
        '/auth/register' => 'POST', '/auth/login' => 'POST', '/auth/session' => 'POST', '/auth/logout' => 'POST', '/auth/status' => 'GET', '/auth/me' => 'GET',
        '/stays/availability' => 'GET', '/stays/bookings' => 'POST', '/stays/payments/orders' => 'POST', '/stays/payments/verify' => 'POST', '/stays/bookings/mine' => 'GET',
        '/stays/bookings/(?P<id>[a-f0-9-]{36})' => 'GET', '/bookings' => 'POST',
        '/admin/overview' => 'GET', '/admin/bookings' => 'GET', '/admin/enquiries' => 'GET',
        '/admin/bookings/(?P<id>[a-f0-9-]{36})/status' => 'POST', '/inquiries' => 'POST', '/consultations' => 'POST',
        '/consultations/upload' => 'POST', '/files/(?P<id>[a-f0-9-]{36})' => 'GET', '/sample-requests' => 'POST', '/product-inquiries' => 'POST', '/quote-requests' => 'POST');
    foreach ($routes as $route => $method) { register_rest_route('bds/v1', $route, array('methods' => $method, 'callback' => 'bds_api', 'permission_callback' => 'bds_permission')); }
});
add_filter('rest_post_dispatch', function ($response, $server, $request) {
    if (strpos($request->get_route(), '/bds/v1/') === 0) {
        if ($request->get_route() === '/bds/v1/stays/availability' && $request->get_method() === 'GET' && $response instanceof WP_REST_Response && $response->get_status() < 400) {
            $response->header('Cache-Control', 'public, max-age=15, stale-while-revalidate=15');
            $response->header('Vary', 'Origin');
        } else {
            $response->header('Cache-Control', 'no-store, private');
            $response->header('Vary', 'Cookie');
        }
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
