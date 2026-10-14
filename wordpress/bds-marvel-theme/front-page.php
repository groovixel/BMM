<?php get_header(); ?>
<?php if (function_exists('bdsm_app_enqueue')) : ?>
<div id="bdsm-marvel-root"></div>
<?php else : ?>
<main class="bds-document"><h1>BDS Marvel</h1><p>Please activate the BDS Marvel App companion plugin.</p></main>
<?php endif; ?>
<?php get_footer(); ?>
