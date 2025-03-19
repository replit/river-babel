#!/usr/bin/env bash

# patch-grpc.sh: Apply a set of rules to coerce protobuf generated types to align.
#
# These patches are intended to be tightly scoped and short-lived.
#
# If possible, when a new rule is added here, please also link the PR which
# fixes the bug upstream.

die() {
  echo "$@" >&2
  exit 1
}

source_root="$1"; shift || die 'Missing argument'

cd "${source_root}"

# If we detect grpc.experimental in a file...
#
#            metadata=None):
#        return grpc.experimental.unary_unary(
#            request,
# ... and we do not find /import grpc\.experimental/...
# ... then we add an import for grpc.experimental alongside import grpc.
grpc_experimental() {
  git grep --name-only grpc.experimental | while read generated; do
    if ! grep --silent 'import grpc.experimental' "${generated}"; then
      echo "Patching grpc.experimental in ${generated}" >&2
      perl -i -p0e 's~^(import grpc)$~$1\n$1.experimental  # type: ignore~m' "${generated}"
    fi
  done
}

# runtime_version was added in protobuf v27.0, but grpc stubs do not have definitions
# for this module.
#
# Suffix that line with #type:ignore
#
# https://github.com/python/typeshed/issues/13045
runtime_version() {
  git grep --name-only '^from google.protobuf import runtime_version as _runtime_version$' | while read generated; do
    echo "Patching runtime_version in ${generated}" >&2
    perl -i -p0e 's~^(from google.protobuf import runtime_version as _runtime_version)$~$1 # type: ignore~m' "${generated}"
  done
}

# _MaybeAsyncIterator is an ABCMeta instead of a simple type union, which seems to be
# giving pyright some difficulty.
#
# -class _MaybeAsyncIterator(collections.abc.AsyncIterator[_T], collections.abc.Iterator[_T], metaclass=abc.ABCMeta): ...
# +_MaybeAsyncIterator = collections.abc.AsyncIterator[_T] | collections.abc.Iterator[_T]
maybe_async_generator() {
  git grep --name-only '^class _MaybeAsyncIterator' | while read generated; do
    echo "Patching _MaybeAsyncIterator in ${generated}" >&2
    perl -i -p0e 's~(class _MaybeAsyncIterator\(collections.abc.AsyncIterator\[_T\], collections.abc.Iterator\[_T\].*)$~# $1\n_MaybeAsyncIterator = collections.abc.AsyncIterator[_T] | collections.abc.Iterator[_T]~m' \
      "${generated}"
  done
}

# StreamUnaryMultiCallable and UnaryUnaryMultiCallable are supplied with type arguments
# in mypy-proto generated stubs, but the actual grpc.aio library does not advertise that
# it accepts type arguments.
#
# For now, let's selectively strip the type arguments.
multi_callable_args() {
  git grep --name-only 'grpc.Unary\(Unary\|Stream\)MultiCallable\[' | while read generated; do
    echo "Patching grpc.Unary(Unary|Stream)MultiCallable in ${generated}" >&2
    # Perl because multiline regex
    perl -i -p0e 's~(grpc\.(?:aio\.)?UnaryUnaryMultiCallable|grpc\.(?:aio\.)?UnaryStreamMultiCallable|grpc\.(?:aio\.)?StreamStreamMultiCallable|grpc\.(?:aio\.)?StreamUnaryMultiCallable|grpc\.(?:aio\.)?StreamUnaryMultiCallable)\[\n[^\n]*\n[^\n]*\n[^]]*\]~$1~gs' \
      "${generated}"
  done
}

ignore_service_context() {
  git grep --name-only 'river\.[a-z]*_method_handler' | while read generated; do
    echo "Patching river.*_method_handler in ${generated}" >&2
    # Perl because multiline regex
    perl -i -p0e 's~(river\.(:?rpc|stream|subscription|upload)_method_handler\(\n[^\n,#]*,)\n~$1  # type: ignore\n~gs' \
      "${generated}"
  done
}

ignore_grpc_utilities() {
  git grep --name-only 'from grpc._utilities[^#]*$' | while read generated; do
    echo "Patching grpc._utilities in ${generated}" >&2
    perl -i -p0e 's~(from grpc._utilities[^#\n]*)$~$1  # type: ignore~m' "${generated}"
  done
}

grpc_experimental
runtime_version
maybe_async_generator
multi_callable_args
ignore_service_context
ignore_grpc_utilities
