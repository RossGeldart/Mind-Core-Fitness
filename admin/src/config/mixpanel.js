import mixpanel from 'mixpanel-browser';

mixpanel.init('b7904ecfdbeee33d496e1cb93b085e0f', {
  track_pageview: false,       // we handle page views manually via router
  persistence: 'localStorage',
  autocapture: true,
  record_sessions_percent: 100,
  api_host: 'https://api-eu.mixpanel.com',
});

export default mixpanel;
