<?php get_header(); ?>
<?php if (function_exists('bdsm_app_enqueue')) : ?>
<div id="bdsm-marvel-root"></div>
<noscript><main class="bds-document"><h1><?php bloginfo('name'); ?></h1><p>Please enable JavaScript to browse the site and book a stay.</p></main></noscript>
<?php else : ?>
<main class="bds-document"><h1>BDS Marvel</h1><p>Please activate the BDS Marvel App companion plugin.</p></main>
<?php endif; ?>
<?php get_footer(); ?>
