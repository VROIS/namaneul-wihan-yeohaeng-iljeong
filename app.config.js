const base = require('./app.json');

const replitDomain = process.env.REPLIT_DEV_DOMAIN;

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      apiDomain: replitDomain ? `https://${replitDomain}` : null,
    },
  },
};
