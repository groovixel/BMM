<?php
if (!defined('ABSPATH')) { exit; }
function bds_content_defaults() {
    static $data;
    if ($data === null) { $data = json_decode(file_get_contents(BDSM_APP_DIR . 'includes/content-defaults.json'), true) ?: array(); }
    return $data;
}
function bds_content_types() {
    return array('bds_project'=>'Projects','bds_collection'=>'Catalogue','bds_stay'=>'Airbnb stays','bds_service'=>'Services','bds_client'=>'Clients','bds_section'=>'Site sections','bds_form'=>'Forms');
}
add_action('init', function () {
    foreach (bds_content_types() as $type=>$label) {
        register_post_type($type,array('label'=>$label,'labels'=>array('name'=>$label,'singular_name'=>rtrim($label,'s'),'add_new_item'=>'Add '.rtrim($label,'s'),'edit_item'=>'Edit '.rtrim($label,'s')),
            'public'=>false,'show_ui'=>true,'show_in_menu'=>'bds-marvel','show_in_rest'=>true,'supports'=>array('title','thumbnail','page-attributes','custom-fields'),
            'capability_type'=>'post','map_meta_cap'=>true));
        register_post_meta($type,'_bds_fields',array('type'=>'string','single'=>true,'show_in_rest'=>true,'sanitize_callback'=>'bds_sanitize_fields','auth_callback'=>function(){return current_user_can('edit_posts');}));
    }
    bds_seed_content();
}, 12);
function bds_sanitize_value($value, $depth=0) {
    if ($depth>15) { return ''; }
    if (is_array($value)) { $out=array();foreach($value as $key=>$v){$out[is_int($key)?$key:sanitize_text_field($key)]=bds_sanitize_value($v,$depth+1);}return $out; }
    if (is_bool($value)||is_int($value)||is_float($value)) { return $value; }
    return sanitize_textarea_field((string)$value);
}
function bds_sanitize_fields($value) {
    $decoded=json_decode($value,true);
    return is_array($decoded)?wp_json_encode(bds_sanitize_value($decoded)):'{}';
}
function bds_default_records() {
    $d=bds_content_defaults();$out=array();
    foreach(array('projects'=>'bds_project','stays'=>'bds_stay','segments'=>'bds_service','clients'=>'bds_client') as $key=>$type){
        foreach($d[$key] as $i=>$item){
            if($type==='bds_service'){$item['extra']=$d['serviceExtras'][$item['slug']]??array();unset($item['extra']['catalogue']);$item['seo']=$d['SEGMENT_SEO'][$item['slug']]??array();}
            if($type==='bds_stay'){$item=array_merge(array('beds'=>$item['bedrooms'],'baths'=>$item['bedrooms'],'type'=>'Home','lat'=>22.5,'lng'=>78.9,'gallery'=>array($item['hero']),'reviews'=>array(),'minNights'=>1),$item);}
            $out[]=array('type'=>$type,'key'=>$item['slug']??sanitize_title($item['name']??'client-'.$i),'data'=>$item,'order'=>$i);
        }
    }
    $collections=array();foreach($d['catalogueItems'] as $item){$collections[$item['slug']]=$item;}
    foreach($d['serviceExtras'] as $service=>$extra){foreach($extra['catalogue']??array() as $item){$slug=$item['slug'];$collections[$slug]=array_merge($item,$collections[$slug]??array());$collections[$slug]['service']=$service;}}
    foreach($collections as $slug=>$item){$item['detail']=$d['catalogueDetails'][$slug]??array('desc'=>'','specs'=>array(),'gallery'=>array(),'products'=>array());$out[]=array('type'=>'bds_collection','key'=>$slug,'data'=>$item,'order'=>count($out));}
    foreach(array('livingStudio','stayTiers','approach','cities','principles','timeline','team') as $key){$out[]=array('type'=>'bds_section','key'=>$key,'data'=>array('key'=>$key,'content'=>$d[$key]??array()),'order'=>count($out));}
    $out[]=array('type'=>'bds_section','key'=>'policies','data'=>array('key'=>'policies','content'=>array('checkIn'=>'2:00 PM','checkOut'=>'11:00 AM','cancellation'=>'Free cancellation up to 7 days before check-in. Within 7 days of arrival the first night is non-refundable.','rules'=>array('No parties or events','No smoking indoors','Pets on request — host confirms','Quiet hours 10 PM – 7 AM'),'safety'=>array('Smoke alarm','First-aid kit','Host on call during your stay'),'draft'=>true)),'order'=>100);
    foreach($d['forms'] as $key=>$item){$item['slug']=$key;$out[]=array('type'=>'bds_form','key'=>$key,'data'=>$item,'order'=>count($out));}
    return $out;
}
function bds_seed_content() {
    if(get_option('bds_content_seeded')==='3.0.0'){return;}
    // An atomic lock prevents duplicate seeding during concurrent first requests.
    if(!add_option('bds_content_seed_lock',time(),'',false)){if((int)get_option('bds_content_seed_lock')<time()-300){delete_option('bds_content_seed_lock');}return;}
    try {
        foreach(bds_default_records() as $record){
            $existing=get_posts(array('post_type'=>$record['type'],'post_status'=>'any','meta_key'=>'_bds_seed_key','meta_value'=>$record['key'],'numberposts'=>1));
            if($existing){continue;}
            $item=$record['data'];$title=$item['title']??$item['name']??ucwords(str_replace(array('-','_'),' ',$record['key']));
            $id=wp_insert_post(array('post_type'=>$record['type'],'post_status'=>'publish','post_title'=>$title,'post_name'=>sanitize_title($record['key']),'menu_order'=>$record['order']),true);
            if(is_wp_error($id)){return;}
            update_post_meta($id,'_bds_seed_key',$record['key']);update_post_meta($id,'_bds_fields',wp_slash(wp_json_encode($item)));
        }
        update_option('bds_content_seeded','3.0.0');
    } finally {delete_option('bds_content_seed_lock');}
}
function bds_content_rows($type) {
    $out=array();foreach(get_posts(array('post_type'=>$type,'post_status'=>'publish','numberposts'=>-1,'orderby'=>array('menu_order'=>'ASC','ID'=>'ASC'))) as $post){
        $data=json_decode(get_post_meta($post->ID,'_bds_fields',true),true)?:array();
        if(in_array($type,array('bds_project','bds_stay','bds_service','bds_collection','bds_client'),true)){
            $data[$type==='bds_project'?'title':'name']=wp_specialchars_decode($post->post_title,ENT_QUOTES);$data['slug']=$post->post_name;
            $image=get_the_post_thumbnail_url($post,'full');if($image){$data[$type==='bds_client'?'logo':(in_array($type,array('bds_stay','bds_service'),true)?'hero':'image')]=$image;}
        }
        if($type==='bds_client' && strpos($data['logo']??'', '/clients/')===0){$data['logo']=BDSM_APP_URL.'build'.$data['logo'];}
        if($type==='bds_form'){$data['slug']=$post->post_name;$data=bds_normalize_form($data);}
        $out[]=$data;
    }return $out;
}
function bds_public_content() {
    $out=array('projects'=>bds_content_rows('bds_project'),'stays'=>bds_content_rows('bds_stay'),'segments'=>bds_content_rows('bds_service'),'clients'=>bds_content_rows('bds_client'),'catalogueItems'=>bds_content_rows('bds_collection'),'catalogueDetails'=>array(),'serviceExtras'=>array(),'SEGMENT_SEO'=>array(),'forms'=>array(),'text'=>get_option('bds_copy_overrides',array()));
    $out=array_merge($out,array('livingStudio'=>array('hero'=>'','kicker'=>'','tagline'=>'','body'=>'','details'=>array()),'stayTiers'=>array(),'approach'=>array(),'cities'=>array(),'principles'=>array(),'timeline'=>array(),'team'=>array(),'policies'=>array('checkIn'=>'','checkOut'=>'','cancellation'=>'','rules'=>array(),'safety'=>array(),'draft'=>true)));
    foreach($out['catalogueItems'] as $item){$out['catalogueDetails'][$item['slug']]=$item['detail']??array('desc'=>'','specs'=>array(),'gallery'=>array(),'products'=>array());}
    foreach($out['segments'] as $segment){$extra=$segment['extra']??array();$extra['catalogue']=array_values(array_filter($out['catalogueItems'],function($i)use($segment){return ($i['service']??'')===$segment['slug'];}));$out['serviceExtras'][$segment['slug']]=$extra;$out['SEGMENT_SEO'][$segment['slug']]=$segment['seo']??array();}
    foreach(bds_content_rows('bds_section') as $item){$out[$item['key']]=$item['content'];}
    foreach(bds_content_rows('bds_form') as $item){unset($item['notification_email']);$out['forms'][$item['slug']]=$item;}
    return $out;
}
function bds_normalize_form($data) {
    $fields=$data['fields']??array();$names=array_column($fields,'name');
    foreach(array('name','email') as $core){
        if(!in_array($core,$names,true)){$fields[]=array('name'=>$core,'label'=>ucfirst($core),'type'=>$core==='email'?'email':'text','required'=>true,'enabled'=>true,'options'=>array(),'placeholder'=>'');}
    }
    foreach($fields as &$field){if(in_array($field['name']??'',array('name','email'),true)){$field['enabled']=true;$field['required']=true;$field['type']=$field['name']==='email'?'email':'text';}}unset($field);
    $data['fields']=$fields;return $data;
}
function bds_form_config($slug) {
    foreach(bds_content_rows('bds_form') as $f){if($f['slug']===$slug){return $f;}}return null;
}
add_action('rest_api_init',function(){register_rest_route('bds/v1','/content',array('methods'=>'GET','callback'=>function(){return new WP_REST_Response(bds_public_content(),200,array('Cache-Control'=>'no-store'));},'permission_callback'=>'__return_true'));});
add_filter('use_block_editor_for_post_type',function($enabled,$type){return isset(bds_content_types()[$type])?false:$enabled;},10,2);
add_action('add_meta_boxes',function(){foreach(bds_content_types() as $type=>$label){remove_meta_box('postcustom',$type,'normal');add_meta_box('bds-content-fields','Website content','bds_content_metabox',$type,'normal','high');}});
function bds_content_metabox($post) {
    wp_nonce_field('bds_content_save','bds_content_nonce');
    $data=json_decode(get_post_meta($post->ID,'_bds_fields',true),true);
    if(!$data){foreach(bds_default_records() as $record){if($record['type']===$post->post_type){$data=$record['data'];break;}}$data=$data?:array();unset($data['slug']);
        if($post->post_type==='bds_project'){$data['title']='';}elseif(in_array($post->post_type,array('bds_stay','bds_collection','bds_service','bds_client'),true)){$data['name']='';}
        if($post->post_type==='bds_form'){$data['fields']=array_values(array_filter($data['fields'],function($f){return in_array($f['name'],array('name','email','message'),true);}));}
    }
    unset($data['title'],$data['name'],$data['slug']);
    echo '<p>Edit the fields below. Use <strong>Add item</strong> and <strong>Remove</strong> for galleries, products, amenities and form fields. Publish to show an entry; draft or trash it to remove it from the website. Use the WordPress title above for its display name, and Order for its position.</p>';
    if($post->post_type==='bds_stay'){echo '<p><strong>Price is INR per night.</strong> Guest capacity and price are enforced by checkout. Existing reservations retain their booked price. Keep the URL slug unchanged when reservations already exist.</p>';}
    if($post->post_type==='bds_collection'){echo '<p>Each entry in <strong>Detail → Products</strong> is a product on the website. You can edit its photo, title, material, finish and use; add or remove products here.</p>';}
    if($post->post_type==='bds_form'){echo '<p>Name and email are required for submissions. Other fields can be added, removed, relabelled or made required. Supported field types: text, email, tel, number, textarea, select, checkbox and file (consultation only). Use unique field names with letters, numbers and underscores.</p><p>Embed this form in a WordPress page with <code>[bds_marvel_form slug="'.esc_attr($post->post_name?:'your-form-slug').'"]</code>.</p>';}
    echo '<input type="hidden" name="bds_content_data" id="bds-content-data" value="'.esc_attr(wp_json_encode($data)).'"><div id="bds-content-editor"></div>';
}
add_action('admin_enqueue_scripts',function($hook){$screen=get_current_screen();if($screen&&isset(bds_content_types()[$screen->post_type??''])){wp_enqueue_media();wp_enqueue_script('bds-content-editor',BDSM_APP_URL.'admin/content-editor.js',array(),'3.0.0',true);wp_enqueue_style('bds-content-editor',BDSM_APP_URL.'admin/content-editor.css',array(),'3.0.0');}});
add_action('save_post',function($id,$post){
    if(!isset(bds_content_types()[$post->post_type])||wp_is_post_revision($id)||defined('DOING_AUTOSAVE')&&DOING_AUTOSAVE){return;}
    if(!isset($_POST['bds_content_nonce'])||!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['bds_content_nonce'])),'bds_content_save')||!current_user_can('edit_post',$id)){return;}
    $raw=wp_unslash($_POST['bds_content_data']??'{}');if(strlen($raw)>1000000){return;}$data=json_decode($raw,true);if(!is_array($data)){return;}
    $data=bds_sanitize_value($data);
    if($post->post_type==='bds_form'){$data=bds_normalize_form($data);}
    if($post->post_type==='bds_stay'){$data['guests']=max(1,(int)($data['guests']??1));$data['price']='₹'.max(0,(int)preg_replace('/[^0-9]/','',$data['price']??''));$data['bedrooms']=max(0,(int)($data['bedrooms']??1));}
    update_post_meta($id,'_bds_fields',wp_slash(wp_json_encode($data)));
},10,2);
add_action('admin_menu',function(){add_submenu_page('bds-marvel','Bookings','Bookings','manage_options','bds-bookings',function(){echo '<div class="wrap"><h1>Bookings</h1><iframe title="BDS booking management" src="'.esc_url(home_url('/owner')).'" style="width:100%;height:1100px;border:0"></iframe></div>';});add_submenu_page('bds-marvel','Text & links','Text & links','manage_options','bds-copy','bds_copy_page');add_submenu_page('bds-marvel','Submissions','Submissions','manage_options','bds-submissions','bds_submissions_page');});
function bds_copy_page() {
    if(!current_user_can('manage_options')){return;}
    $overrides=get_option('bds_copy_overrides',array());
    if(isset($_POST['bds_copy_save'])){check_admin_referer('bds_copy_save');foreach(wp_unslash($_POST['bds_copy']??array()) as $original=>$replacement){$original=base64_decode($original,true);if($original===false){continue;}$replacement=sanitize_textarea_field($replacement);if($original===$replacement){unset($overrides[$original]);}else{$overrides[$original]=$replacement;}}update_option('bds_copy_overrides',$overrides);echo '<div class="notice notice-success"><p>Text and links saved. Refresh the website to see your changes.</p></div>';}
    $q=sanitize_text_field(wp_unslash($_GET['s']??''));$page=max(1,absint($_GET['paged']??1));$entries=bds_content_defaults()['siteCopy'];if($q){$entries=array_values(array_filter($entries,function($e)use($q){return stripos($e['original'],$q)!==false||stripos($e['section'],$q)!==false;}));}
    echo '<div class="wrap"><h1>Website text & links</h1><p>Search for visible text, a phone number, email, or URL. A replacement applies wherever that exact text appears. Projects, catalogue and stay details have their own menus. Plain text only; the site layout is preserved.</p><form method="get"><input type="hidden" name="page" value="bds-copy"><input type="search" name="s" value="'.esc_attr($q).'" placeholder="Search website text or links">';submit_button('Search','secondary','',false);echo '</form><form method="post">';wp_nonce_field('bds_copy_save');
    foreach(array_slice($entries,($page-1)*40,40) as $entry){$original=$entry['original'];echo '<p><label><strong>'.esc_html($entry['section']).'</strong><br><span>'.esc_html($original).'</span><br><textarea name="bds_copy['.esc_attr(base64_encode($original)).']" rows="2" class="large-text">'.esc_textarea($overrides[$original]??$original).'</textarea></label></p>';}
    submit_button('Save text & links','primary','bds_copy_save');echo '</form><p>';for($i=1;$i<=ceil(count($entries)/40);$i++){echo '<a style="margin-right:10px" href="'.esc_url(add_query_arg(array('page'=>'bds-copy','s'=>$q,'paged'=>$i),admin_url('admin.php'))).'">'.$i.'</a>'; }echo '</p></div>';
}
function bds_submissions_page() {
    if(!current_user_can('manage_options')){return;}global $wpdb;
    if(isset($_POST['bds_delete_enquiry'])){check_admin_referer('bds_delete_enquiry');$wpdb->delete($wpdb->prefix.'bds_enquiries',array('id'=>sanitize_text_field(wp_unslash($_POST['bds_delete_enquiry']))));echo '<div class="notice notice-success"><p>Submission removed.</p></div>';}
    echo '<div class="wrap"><h1>Form submissions</h1><p>All website form submissions are stored here. Bookings are managed in the <a href="'.esc_url(home_url('/owner')).'">owner dashboard</a>.</p>';
    foreach($wpdb->get_results("SELECT id,data FROM {$wpdb->prefix}bds_enquiries ORDER BY created_at DESC LIMIT 200",ARRAY_A) as $row){$item=json_decode($row['data'],true);echo '<details style="background:white;padding:15px;margin:10px 0"><summary><strong>'.esc_html(($item['type']??'Form').' — '.($item['name']??'')).'</strong> · '.esc_html($item['email']??'').'</summary><table class="widefat">';foreach($item as $k=>$v){if(is_scalar($v)){echo '<tr><th>'.esc_html($k).'</th><td>'.esc_html($v).'</td></tr>';}}echo '</table><form method="post">';wp_nonce_field('bds_delete_enquiry');echo '<button class="button" name="bds_delete_enquiry" value="'.esc_attr($row['id']).'" onclick="return confirm(\'Permanently remove this submission?\')">Delete submission</button></form></details>'; }echo '</div>';
}
// Additional forms can be placed in ordinary WordPress pages without rebuilding React.
add_action('rest_api_init',function(){register_rest_route('bds/v1','/forms/(?P<slug>[a-z0-9-]+)',array('methods'=>'POST','permission_callback'=>'bds_permission','callback'=>function($request){
    $slug=$request['slug'];$config=bds_form_config($slug);if(!$config||empty($config['enabled'])){return bds_error('This form is currently unavailable.',410);}
    if(!bds_limit('enquiries',20)){return bds_error('Too many requests. Please try again later.',429);}
    if(strlen($request->get_body())>50000){return bds_error('Please shorten your request.',413);}
    $data=bds_clean($request->get_json_params()?:array());if(empty($data['name'])||!is_email($data['email']??'')){return bds_error('Enter your name and a valid email address.');}
    foreach($config['fields']??array() as $field){$key=sanitize_key($field['name']);if(!empty($field['enabled'])&&!empty($field['required'])&&empty($data[$key])){return bds_error('Please complete: '.$field['label']);}}
    $data=array_merge($data,array('id'=>wp_generate_uuid4(),'type'=>'Custom form: '.$slug,'form_slug'=>$slug,'created_at'=>gmdate('c')));global $wpdb;
    if(!$wpdb->insert($wpdb->prefix.'bds_enquiries',array('id'=>$data['id'],'type'=>substr($data['type'],0,40),'created_at'=>current_time('mysql',true),'data'=>wp_json_encode($data)))){return bds_error('Your submission could not be saved.',500);}
    bds_notify($data,'BDS Marvel — '.$slug);return new WP_REST_Response(array('id'=>$data['id'],'message'=>$config['success_message']??'Request received.'),201);
}));});
add_shortcode('bds_marvel_form',function($atts){
    $slug=sanitize_title(shortcode_atts(array('slug'=>''),$atts)['slug']);$config=bds_form_config($slug);if(!$config||empty($config['enabled'])){return '';}
    wp_enqueue_script('bds-public-form',BDSM_APP_URL.'admin/public-form.js',array(),'3.0.0',true);
    $html='<form class="bds-public-form" data-endpoint="'.esc_url(rest_url('bds/v1/forms/'.$slug)).'">';
    foreach($config['fields']??array() as $field){if(empty($field['enabled'])||($field['type']??'')==='file'){continue;}$name=sanitize_key($field['name']);$type=$field['type']??'text';$required=!empty($field['required'])||in_array($name,array('name','email'),true)?' required':'';$html.='<p><label>'.esc_html($field['label']).'<br>';
        $attributes=' name="'.esc_attr($name).'" placeholder="'.esc_attr($field['placeholder']??'').'"'.$required;
        if($type==='textarea'){$html.='<textarea'.$attributes.' rows="4"></textarea>';}
        elseif($type==='select'){$html.='<select'.$attributes.'>';foreach($field['options']??array() as $o){$html.='<option value="'.esc_attr($o['value']).'">'.esc_html($o['label']).'</option>';}$html.='</select>';}
        else{$html.='<input type="'.esc_attr(in_array($type,array('text','email','tel','number','checkbox'),true)?$type:'text').'"'.$attributes.'>';}$html.='</label></p>';
    }
    return $html.'<button type="submit">'.esc_html($config['submit_label']??'Send').'</button><p class="bds-form-result" role="status"></p></form>';
});
