<?php
/**
 * Plugin Name: BDS Marvel App
 * Description: Embeds the BDS Marvel (BDSM) React application into any WordPress page/post via the [bds_marvel_app] shortcode. The whole single-page app runs inside one WordPress page using HashRouter.
 * Version: 1.0.0
 * Author: BDS Marvel
 */

if (!defined('ABSPATH')) { exit; }

define('BDSM_APP_DIR', plugin_dir_path(__FILE__));
define('BDSM_APP_URL', plugin_dir_url(__FILE__));
define('BDSM_APP_BUILD_DIR', BDSM_APP_DIR . 'build/');
define('BDSM_APP_BUILD_URL', BDSM_APP_URL . 'build/');

/**
 * Read the CRA asset-manifest.json produced by `yarn build`.
 */
function bdsm_app_manifest() {
    $manifest_path = BDSM_APP_BUILD_DIR . 'asset-manifest.json';
    if (!file_exists($manifest_path)) { return null; }
    $json = file_get_contents($manifest_path);
    return json_decode($json, true);
}

/**
 * Register every entrypoint (runtime + main js/css) with correct absolute URLs.
 * Assets are served from this plugin's build/ folder, so they work on any domain.
 */
function bdsm_app_register_assets() {
    $manifest = bdsm_app_manifest();
    if (!$manifest || empty($manifest['entrypoints'])) { return; }

    $css_handles = array();
    $js_handles  = array();
    $i = 0;
    foreach ($manifest['entrypoints'] as $file) {
        $url = BDSM_APP_BUILD_URL . ltrim($file, '/');
        if (substr($file, -4) === '.css') {
            $handle = 'bdsm-app-css-' . $i;
            wp_register_style($handle, $url, array(), null);
            $css_handles[] = $handle;
        } elseif (substr($file, -3) === '.js') {
            $handle = 'bdsm-app-js-' . $i;
            // in_footer = true so the mount node exists before the app boots
            wp_register_script($handle, $url, array(), null, true);
            $js_handles[] = $handle;
        }
        $i++;
    }
    $GLOBALS['bdsm_app_css_handles'] = $css_handles;
    $GLOBALS['bdsm_app_js_handles']  = $js_handles;
}
add_action('wp_enqueue_scripts', 'bdsm_app_register_assets');

/**
 * [bds_marvel_app] — outputs the mount node and enqueues the bundle only on
 * pages that actually use the shortcode.
 */
function bdsm_app_shortcode($atts) {
    if (empty($GLOBALS['bdsm_app_js_handles'])) {
        return '<div style="padding:24px;font-family:sans-serif;border:1px solid #ddd;border-radius:8px">'
             . '<strong>BDS Marvel app build not found.</strong><br>'
             . 'Build the React app for WordPress and upload its <code>build/</code> folder into '
             . '<code>wp-content/plugins/bds-marvel-app/build/</code>.</div>';
    }
    foreach ($GLOBALS['bdsm_app_css_handles'] as $h) { wp_enqueue_style($h); }
    foreach ($GLOBALS['bdsm_app_js_handles'] as $h) { wp_enqueue_script($h); }
    return '<div id="bdsm-marvel-root"></div>';
}
add_shortcode('bds_marvel_app', 'bdsm_app_shortcode');
