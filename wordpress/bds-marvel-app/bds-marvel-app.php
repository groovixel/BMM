<?php
/**
 * Plugin Name: BDS Marvel App
 * Description: BDS Marvel design, WordPress guest accounts, bookings, private enquiries and owner dashboard. Use [bds_marvel_app] or the companion theme.
 * Version: 3.3.13
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: BDS Marvel
 * License: GPL-2.0-or-later
 */
if (!defined('ABSPATH')) { exit; }
// Allow Jetpack signed XML-RPC requests; block other XML-RPC requests.
add_filter('xmlrpc_enabled', '__return_false');
add_filter('pings_open', '__return_false');
add_action('plugins_loaded', function () {
    $script = isset($_SERVER['SCRIPT_FILENAME']) ? basename($_SERVER['SCRIPT_FILENAME']) : '';
    if ($script === 'xmlrpc.php' && (!isset($_GET['for']) || $_GET['for'] !== 'jetpack')) {
        status_header(403);
        header('Content-Type: text/plain; charset=utf-8');
        exit('XML-RPC is disabled.');
    }
}, -1000);
define('BDSM_APP_DIR', plugin_dir_path(__FILE__));
define('BDSM_APP_URL', plugin_dir_url(__FILE__));
require_once BDSM_APP_DIR . 'includes/api.php';
require_once BDSM_APP_DIR . 'includes/admin.php';
require_once BDSM_APP_DIR . 'includes/content.php';
require_once BDSM_APP_DIR . 'includes/seo.php';
register_activation_hook(__FILE__, 'bds_install');

function bdsm_app_enqueue($mode = 'hash') {
    static $loaded = false;
    if ($loaded) { return; }
    $loaded = true;
    $manifest = json_decode(file_get_contents(BDSM_APP_DIR . 'build/asset-manifest.json'), true);
    foreach ($manifest['entrypoints'] ?? array() as $i => $file) {
        if (!preg_match('#^static/(js|css)/[a-zA-Z0-9._/-]+\.(js|css)$#', $file) || strpos($file, '..') !== false) { continue; }
        $url = BDSM_APP_URL . 'build/' . $file;
        if (substr($file, -4) === '.css') { wp_enqueue_style('bdsm-app-css-' . $i, $url, array(), '3.3.13'); }
        if (substr($file, -3) === '.js') {
            $config = array('apiUrl' => untrailingslashit(rest_url('bds/v1')), 'assetUrl' => BDSM_APP_URL . 'build',
                'content' => bds_public_content(), 'native' => true, 'routerMode' => $mode, 'basename' => wp_parse_url(home_url('/'), PHP_URL_PATH),
                'passwordResetUrl' => wp_lostpassword_url(),
                'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '',
                'paymentsEnabled' => (bool) bds_razorpay_credentials());
            wp_register_script('bdsm-app-config', '', array(), '3.3.13', false);
            wp_enqueue_script('bdsm-app-config');
            wp_add_inline_script('bdsm-app-config', 'window.BDS_WORDPRESS = ' . wp_json_encode($config) . ';', 'before');
            wp_enqueue_script_module('bdsm-app-module', $url, array(), '3.3.13', array('in_footer' => false));
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
