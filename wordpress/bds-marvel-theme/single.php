<?php get_header(); ?>
<main class="bds-document"><p><a href="<?php echo esc_url(home_url('/')); ?>">BDS Marvel — Home</a></p>
<?php if (have_posts()) : while (have_posts()) : the_post(); ?>
<article <?php post_class(); ?>><h1><?php the_title(); ?></h1><?php the_content(); ?></article>
<?php endwhile; the_posts_navigation(); else : ?><h1>Page not found</h1><?php endif; ?>
</main><?php get_footer(); ?>
