const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = /(^|\/)(\.local|\.agents|\.githooks|\.git|server_dist|dist|attached_assets)\/.*/;

module.exports = config;
