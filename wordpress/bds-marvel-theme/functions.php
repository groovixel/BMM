<?php
if (!defined('ABSPATH')) { exit; }
add_action('after_setup_theme', function () {
    add_theme_support('title-tag'); add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form','gallery','caption','style','script'));
    add_theme_support('responsive-embeds'); add_theme_support('align-wide');
});
function bds_theme_routes() {
    add_rewrite_rule('^(about|contact|experience|owner|projects|businesses|catalogue|stays|work|agency)(/.*)?/?$', 'index.php?bds_app=1', 'top');
}
add_action('init', 'bds_theme_routes');
add_filter('query_vars', function ($vars) { $vars[] = 'bds_app'; return $vars; });
add_action('after_switch_theme', function () { bds_theme_routes(); flush_rewrite_rules(); });
add_filter('template_include', function ($template) {
    if (get_query_var('bds_app')) {
        status_header(200);
        return get_theme_file_path('front-page.php');
    }
    return $template;
});
add_filter('redirect_canonical', function ($redirect) { return get_query_var('bds_app') ? false : $redirect; });
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style('bds-theme', get_stylesheet_uri(), array(), '2.0.0');
    if ((is_front_page() || get_query_var('bds_app')) && function_exists('bdsm_app_enqueue')) {
        bdsm_app_enqueue('browser');
    }
});
add_action('admin_notices', function () {
    if (!function_exists('bdsm_app_enqueue') && current_user_can('activate_plugins')) {
        echo '<div class="notice notice-warning"><p>BDS Marvel requires the companion BDS Marvel App plugin. Install and activate bds-marvel-app.zip first.</p></div>';
    }
});
