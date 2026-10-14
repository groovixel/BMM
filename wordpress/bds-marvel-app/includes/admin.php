<?php
if (!defined('ABSPATH')) { exit; }
add_action('admin_init', function () {
    register_setting('bds_settings', 'bds_notification_email', array('type' => 'string', 'sanitize_callback' => 'sanitize_email', 'default' => get_option('admin_email')));
    register_setting('bds_settings', 'bds_allow_registration', array('type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 1));
    register_setting('bds_settings', 'bds_razorpay_key_id', array('type' => 'string', 'sanitize_callback' => 'sanitize_text_field', 'default' => ''));
    register_setting('bds_settings', 'bds_razorpay_key_secret', array('type' => 'string', 'sanitize_callback' => 'bds_save_razorpay_secret', 'default' => ''));
});
function bds_save_razorpay_secret($value) {
    $value = trim(sanitize_text_field((string) $value));
    return $value === '' ? get_option('bds_razorpay_key_secret', '') : $value;
}
add_action('admin_menu', function () {
    add_menu_page('BDS Marvel', 'BDS Marvel', 'manage_options', 'bds-marvel', 'bds_admin_page', 'dashicons-building');
});
function bds_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    global $wpdb;
    echo '<div class="wrap"><h1>BDS Marvel</h1><p><a class="button button-primary" href="' . esc_url(home_url('/owner')) . '">Open owner dashboard</a></p>';
    echo '<h2>Settings</h2><form action="options.php" method="post">';
    settings_fields('bds_settings');
    echo '<p><label>Notification email <input type="email" name="bds_notification_email" value="' . esc_attr(get_option('bds_notification_email', get_option('admin_email'))) . '" required></label></p>';
    echo '<input type="hidden" name="bds_allow_registration" value="0"><p><label><input type="checkbox" name="bds_allow_registration" value="1" ' . checked(1, get_option('bds_allow_registration', 1), false) . '> Allow guest account registration</label></p>';
    echo '<h3>Razorpay payments</h3><p>Use Razorpay test keys first. The key secret stays on the server and is never sent to the checkout page.</p>';
    echo '<p><label>Key ID <input type="text" name="bds_razorpay_key_id" value="' . esc_attr(get_option('bds_razorpay_key_id', '')) . '" autocomplete="off" class="regular-text" placeholder="rzp_test_…"></label></p>';
    echo '<p><label>Key secret <input type="password" name="bds_razorpay_key_secret" value="" autocomplete="new-password" class="regular-text" placeholder="' . (get_option('bds_razorpay_key_secret', '') ? 'Saved; leave blank to keep current key' : 'Paste the Razorpay key secret') . '"></label></p>';
    submit_button(); echo '</form><h2>Recent enquiries</h2>';
    $rows = $wpdb->get_results("SELECT data FROM {$wpdb->prefix}bds_enquiries ORDER BY created_at DESC LIMIT 100", ARRAY_A);
    echo '<table class="widefat striped"><thead><tr><th>Type</th><th>Name</th><th>Email</th><th>Details</th><th>Attachment</th></tr></thead><tbody>';
    foreach ($rows as $row) {
        $item = json_decode($row['data'], true);
        echo '<tr><td>' . esc_html($item['type']) . '</td><td>' . esc_html($item['name']) . '</td><td>' . esc_html($item['email']) . '</td><td>';
        echo esc_html($item['message'] ?? $item['requirements'] ?? $item['product'] ?? '');
        echo '</td><td>';
        if (!empty($item['file_id'])) {
            $url = add_query_arg('_wpnonce', wp_create_nonce('wp_rest'), rest_url('bds/v1/files/' . $item['file_id']));
            echo '<a href="' . esc_url($url) . '">Download ' . esc_html($item['file_name'] ?? 'attachment') . '</a>';
        }
        echo '</td></tr>';
    }
    echo '</tbody></table><p>Bookings and enquiries remain saved if you change themes or deactivate this plugin. Email is sent through WordPress; configure your hosting mail service or SMTP for delivery.</p></div>';
}
