/**
 * PostHog for the landing page and the Claude/ChatGPT guide (the app loads it from npm instead).
 * The key stays empty here: scripts/build-pages.mjs writes EXPO_PUBLIC_POSTHOG_KEY and
 * EXPO_PUBLIC_POSTHOG_HOST into the published copy. No key, or localhost: nothing loads.
 * Same settings as the app: all text and inputs masked in recordings, no element text collected.
 */
(function () {
  var KEY = 'phc_sW6a7H7drxKs8ovqi5Dq2Lbnt7JmkQvnyU7cvZcCGba9';
  var HOST = 'https://eu.i.posthog.com';
  if (!KEY || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  // PostHog's standard loader: a stub that queues calls until array.js arrives.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  window.posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
  });
  window.posthog.register({ app: 'kosmik-site' });
})();
