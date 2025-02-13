const webpack = require('webpack');

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.resolve.fallback = {
                crypto: require.resolve('crypto-browserify'),
                https: require.resolve('https-browserify'),
                zlib: require.resolve('browserify-zlib'),
                stream: require.resolve('stream-browserify'),
                fs: false,
                process: require.resolve('process/browser'),
                vm: require.resolve('vm-browserify'),
                assert: require.resolve('assert/'),
                http: require.resolve('stream-http'),
                url: require.resolve('url/'),
                util: require.resolve('util/'),
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
};
