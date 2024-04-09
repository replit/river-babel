#! /usr/bin/env bash
if ! test -f ./serviceDefs.ts; then
  cp ../../serviceDefs.ts ./serviceDefs.ts
fi

echo 'done'