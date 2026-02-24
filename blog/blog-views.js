(function() {
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBCIgMJd3By7qkWH27YiW9VooIBGE3bFLs",
    projectId: "mind-core-fitness-client"
  };

  // Derive slug from URL path: /blog/some-post → some-post
  var path = window.location.pathname.replace(/\/$/, '').replace(/\.html$/, '');
  var slug = path.split('/').pop();
  if (!slug) return;

  var FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/'
    + FIREBASE_CONFIG.projectId
    + '/databases/(default)/documents/blogViews/' + slug;

  var viewEl = document.getElementById('blog-view-count');

  // Only count once per session per post
  var sessionKey = 'blogView_' + slug;
  var alreadyCounted = false;
  try { alreadyCounted = !!sessionStorage.getItem(sessionKey); } catch(e) {}

  // Fetch current count, then increment if needed
  fetch(FIRESTORE_BASE + '?key=' + FIREBASE_CONFIG.apiKey)
    .then(function(res) {
      if (res.status === 404) {
        // Document doesn't exist yet — create it
        if (!alreadyCounted) {
          try { sessionStorage.setItem(sessionKey, '1'); } catch(e) {}
          return fetch(
            FIRESTORE_BASE + '?key=' + FIREBASE_CONFIG.apiKey,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: { count: { integerValue: '1' } }
              })
            }
          ).then(function() {
            if (viewEl) viewEl.textContent = '1 view';
          });
        }
        return;
      }
      return res.json().then(function(data) {
        var current = parseInt((data.fields && data.fields.count && data.fields.count.integerValue) || '0', 10);
        var display = current;

        if (!alreadyCounted) {
          display = current + 1;
          try { sessionStorage.setItem(sessionKey, '1'); } catch(e) {}

          // Increment using Firestore REST — use the transform/increment approach
          var commitUrl = 'https://firestore.googleapis.com/v1/projects/'
            + FIREBASE_CONFIG.projectId
            + '/databases/(default)/documents:commit?key=' + FIREBASE_CONFIG.apiKey;

          fetch(commitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              writes: [{
                transform: {
                  document: 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/blogViews/' + slug,
                  fieldTransforms: [{
                    fieldPath: 'count',
                    increment: { integerValue: '1' }
                  }]
                }
              }]
            })
          }).catch(function() {});
        }

        if (viewEl) viewEl.textContent = display + (display === 1 ? ' view' : ' views');
      });
    })
    .catch(function() {
      // Silently fail — don't break the page
    });
})();
