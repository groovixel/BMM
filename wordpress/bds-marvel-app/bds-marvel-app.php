<?php
/**
 * Plugin Name: BDS Marvel App
 * Description: BDS Marvel design, WordPress guest accounts, bookings, private enquiries and owner dashboard. Use [bds_marvel_app] or the companion theme.
 * Version: 2.0.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: BDS Marvel
 * License: GPL-2.0-or-later
 */
if (!defined('ABSPATH')) { exit; }
define('BDSM_APP_DIR', plugin_dir_path(__FILE__));
define('BDSM_APP_URL', plugin_dir_url(__FILE__));
require_once BDSM_APP_DIR . 'includes/api.php';
require_once BDSM_APP_DIR . 'includes/admin.php';
register_activation_hook(__FILE__, 'bds_install');

function bdsm_app_enqueue($mode = 'hash') {
    static $loaded = false;
    if ($loaded) { return; }
    $loaded = true;
    $manifest = json_decode(file_get_contents(BDSM_APP_DIR . 'build/asset-manifest.json'), true);
    $previous = array();
    foreach ($manifest['entrypoints'] ?? array() as $i => $file) {
        if (!preg_match('#^static/(js|css)/[a-zA-Z0-9._/-]+\.(js|css)$#', $file) || strpos($file, '..') !== false) { continue; }
        $url = BDSM_APP_URL . 'build/' . $file;
        if (substr($file, -4) === '.css') { wp_enqueue_style('bdsm-app-css-' . $i, $url, array(), '2.0.0'); }
        if (substr($file, -3) === '.js') {
            $handle = 'bdsm-app-js-' . $i;
            wp_enqueue_script($handle, $url, $previous, '2.0.0', true);
            if (!$previous) {
                $config = array('apiUrl' => untrailingslashit(rest_url('bds/v1')), 'assetUrl' => BDSM_APP_URL . 'build',
                    'native' => true, 'routerMode' => $mode, 'basename' => wp_parse_url(home_url('/'), PHP_URL_PATH),
                    'passwordResetUrl' => wp_lostpassword_url(),
                    'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '');
                wp_add_inline_script($handle, 'window.BDS_WORDPRESS = ' . wp_json_encode($config) . ';', 'before');
            }
            $previous[] = $handle;
        }
    }
    wp_enqueue_style('bdsm-app-fonts', 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700;800&display=swap', array(), null);
}
add_action('wp_enqueue_scripts', function () {
    if (is_singular() && has_shortcode(get_post()->post_content, 'bds_marvel_app')) { bdsm_app_enqueue(); }
});
add_shortcode('bds_marvel_app', function () {
    bdsm_app_enqueue();
    static $rendered = false;
    if ($rendered) { return ''; }
    $rendered = true;
    return '<div id="bdsm-marvel-root"></div><noscript>Please enable JavaScript to browse BDS Marvel and book a stay.</noscript>';
});
