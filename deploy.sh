npm run build
npm run validate
npm run manifest:build
npm run build:seo:prod

# TODO: convert to a smarter recursive copy in js that can ignore patterns recursively and skip noop uploads
aws s3 cp --recursive ./ s3://math.cognotik.com/ \
  --exclude "node_modules/*" \
  --exclude "test/*" \
  --exclude ".pnpm/*" \
  --exclude "public/*" \
  --exclude ".lake/*" \
  --exclude "videos/*" \
  --exclude "docs/*" \
  --exclude "scripts/*" \
  --exclude "package.json" \
  --exclude "package-lock.json" \
  --exclude "tsconfig.json" \
  --exclude "webpack.config.js" \
  --exclude ".git/*" \
  --exclude "android-twa/*" \
  --exclude "terraform/*" \
  --exclude "demo/*" \
  --exclude ".*/*" \
  --exclude "*.sh" \
  --exclude "LICENSE"

aws cloudfront create-invalidation \
  --distribution-id E2V4URD2KDRZ6N \
  --paths "/*"
