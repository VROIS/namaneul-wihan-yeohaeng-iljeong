const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const rootDir = __dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = new RegExp(
  `^${rootDir}/(\\.local|\\.agents|\\.githooks|\\.git|server_dist|dist|attached_assets)/.*`
);

module.exports = config;
