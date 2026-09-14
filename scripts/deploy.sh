#!/bin/bash

pushd `dirname $0`
cd ..
#npm run build
#npm run validate
npm run manifest:build
npm run build:seo:prod

node scripts/s3-sync.cjs --prune

aws cloudfront create-invalidation \
  --distribution-id E3GDFNEREGH448 \
  --paths "/*"
popd
