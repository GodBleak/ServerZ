#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <lzma.h>

#if defined(_WIN32)
  #define STEAM_LZMA_EXPORT __declspec(dllexport)
#else
  #define STEAM_LZMA_EXPORT __attribute__((visibility("default")))
#endif

// Decompress an LZMA-alone payload:
//   5 bytes properties + 8 bytes little-endian uncompressed size + compressed payload
// into a caller-provided output buffer.
//
// Returns 0 on success, otherwise an lzma_ret value.
STEAM_LZMA_EXPORT int steam_lzma_decompress_alone(
  const uint8_t *input,
  size_t input_len,
  uint8_t *output,
  size_t output_len,
  uint64_t memlimit,
  size_t *written
) {
  if (written != NULL) *written = 0;
  if (input == NULL || output == NULL || written == NULL) return LZMA_PROG_ERROR;

  lzma_stream stream = LZMA_STREAM_INIT;
  lzma_ret ret = lzma_alone_decoder(&stream, memlimit);
  if (ret != LZMA_OK) {
    lzma_end(&stream);
    return (int)ret;
  }

  stream.next_in = input;
  stream.avail_in = input_len;
  stream.next_out = output;
  stream.avail_out = output_len;

  ret = lzma_code(&stream, LZMA_FINISH);
  *written = output_len - stream.avail_out;
  size_t remaining_input = stream.avail_in;

  lzma_end(&stream);

  if (ret != LZMA_STREAM_END) {
    return (int)ret;
  }

  // Steam VZip chunks should be complete self-contained LZMA-alone streams.
  if (remaining_input != 0) {
    return LZMA_DATA_ERROR;
  }

  if (*written != output_len) {
    return LZMA_DATA_ERROR;
  }

  return 0;
}

STEAM_LZMA_EXPORT const char *steam_lzma_error_name(int code) {
  switch ((lzma_ret)code) {
    case LZMA_OK: return "LZMA_OK";
    case LZMA_STREAM_END: return "LZMA_STREAM_END";
    case LZMA_NO_CHECK: return "LZMA_NO_CHECK";
    case LZMA_UNSUPPORTED_CHECK: return "LZMA_UNSUPPORTED_CHECK";
    case LZMA_GET_CHECK: return "LZMA_GET_CHECK";
    case LZMA_MEM_ERROR: return "LZMA_MEM_ERROR";
    case LZMA_MEMLIMIT_ERROR: return "LZMA_MEMLIMIT_ERROR";
    case LZMA_FORMAT_ERROR: return "LZMA_FORMAT_ERROR";
    case LZMA_OPTIONS_ERROR: return "LZMA_OPTIONS_ERROR";
    case LZMA_DATA_ERROR: return "LZMA_DATA_ERROR";
    case LZMA_BUF_ERROR: return "LZMA_BUF_ERROR";
    case LZMA_PROG_ERROR: return "LZMA_PROG_ERROR";
    default: return "LZMA_UNKNOWN_ERROR";
  }
}

STEAM_LZMA_EXPORT uint32_t steam_lzma_abi_version(void) {
  return 1;
}
