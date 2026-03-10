const webpack = require('webpack');

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.resolve.fallback = {
                electron: false,
                'electron/main': false,
                'electron-is-dev': false,
            };
            webpackConfig.plugins.push(
                new webpack.ProvidePlugin({
                    process: 'process/browser',
                    Buffer: ['buffer', 'Buffer'],
                })
            );
            return webpackConfig;
        },
    },
    devServer: {
        client: {
            overlay: {
                errors: true,
                warnings: false,
                runtimeErrors: false,
            },
        },
    },
};