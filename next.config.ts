/** @type {import('next').NextConfig} */

// 環境変数から本番ビルドモードかどうかを判断
const isProductionBuild = process.env.BUILD_MODE === 'production';

let basePathEnv = process.env.NEXT_PUBLIC_BASE_PATH || '';
// Normalize: ensure basePathEnv (if present) starts with a leading '/'
if (basePathEnv && !basePathEnv.startsWith('/')) {
  basePathEnv = '/' + basePathEnv;
}
const configuredBasePath = basePathEnv || undefined;
// 開発環境でも静的エクスポートに近い動作をさせるために共通設定を定義
const commonConfig = {
  // 画像設定
  images: {
    unoptimized: true, // 静的エクスポートでは必須
  },
  env: {
    NEXT_PUBLIC_IS_PRODUCTION_BUILD: String(isProductionBuild),
    NEXT_PUBLIC_BASE_PATH: basePathEnv,
  },
  // 開発環境と本番環境の共通設定
  staticPageGenerationTimeout: 300,
};

const nextConfig = {
  // 共通設定を適用
  ...commonConfig,

  // 本番ビルドモード時のみ静的エクスポートを有効化
  output: isProductionBuild ? 'export' : undefined,
  trailingSlash: isProductionBuild,
  // 静的エクスポート時のみ必要な設定
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: isProductionBuild,
  },
  basePath: configuredBasePath,
  assetPrefix: configuredBasePath,
};

console.log(`Building in ${isProductionBuild ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

module.exports = nextConfig;
