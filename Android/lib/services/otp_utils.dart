import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

class OtpUtils {
  static const String masterOtpSecret = 'CLIC_DRIVER_OTP_SECRET_KEY_2026';

  /// Genera un PIN temporal de 4 dígitos a partir del código de desafío (Challenge Code).
  static String generateOtpFromChallenge(String challenge) {
    if (challenge.isEmpty) return '';
    final cleanChallenge = challenge.replaceAll(RegExp(r'\D'), '');
    if (cleanChallenge.isEmpty) return '';

    final bytes = _hmacSha256(utf8.encode(masterOtpSecret), utf8.encode(cleanChallenge));
    final offset = bytes[bytes.length - 1] & 0x0f;
    final binary = ((bytes[offset] & 0x7f) << 24) |
        ((bytes[offset + 1] & 0xff) << 16) |
        ((bytes[offset + 2] & 0xff) << 8) |
        (bytes[offset + 3] & 0xff);

    final otpNum = (binary % 9000) + 1000;
    return otpNum.toString();
  }

  /// Genera un código de desafío aleatorio de 6 dígitos para mostrar en pantalla.
  static String generateChallengeCode() {
    final rng = Random();
    final rand = rng.nextInt(900000) + 100000;
    return rand.toString();
  }

  // --- Pure Dart HMAC-SHA256 Implementation (100% Offline & Standalone) ---

  static Uint8List _hmacSha256(List<int> key, List<int> message) {
    const blockSize = 64;
    List<int> formattedKey = key;
    if (formattedKey.length > blockSize) {
      formattedKey = _sha256(formattedKey);
    }
    if (formattedKey.length < blockSize) {
      final padded = List<int>.filled(blockSize, 0);
      padded.setRange(0, formattedKey.length, formattedKey);
      formattedKey = padded;
    }

    final oKeyPad = List<int>.generate(blockSize, (i) => formattedKey[i] ^ 0x5c);
    final iKeyPad = List<int>.generate(blockSize, (i) => formattedKey[i] ^ 0x36);

    final innerHash = _sha256([...iKeyPad, ...message]);
    return Uint8List.fromList(_sha256([...oKeyPad, ...innerHash]));
  }

  static List<int> _sha256(List<int> message) {
    final k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    var h0 = 0x6a09e667;
    var h1 = 0xbb67ae85;
    var h2 = 0x3c6ef372;
    var h3 = 0xa54ff53a;
    var h4 = 0x510e527f;
    var h5 = 0x9b05688c;
    var h6 = 0x1f83d9ab;
    var h7 = 0x5be0cd19;

    final length = message.length;
    final bitLength = length * 8;
    final paddedLength = ((length + 9 + 63) ~/ 64) * 64;
    final bytes = Uint8List(paddedLength);
    bytes.setRange(0, length, message);
    bytes[length] = 0x80;

    final bd = ByteData.view(bytes.buffer);
    bd.setUint64(paddedLength - 8, bitLength, Endian.big);

    final w = Int32List(64);

    for (var i = 0; i < paddedLength; i += 64) {
      for (var t = 0; t < 16; t++) {
        w[t] = bd.getInt32(i + (t * 4), Endian.big);
      }
      for (var t = 16; t < 64; t++) {
        final s0 = _rotr(w[t - 15], 7) ^ _rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        final s1 = _rotr(w[t - 2], 17) ^ _rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) & 0xFFFFFFFF;
      }

      var a = h0;
      var b = h1;
      var c = h2;
      var d = h3;
      var e = h4;
      var f = h5;
      var g = h6;
      var h = h7;

      for (var t = 0; t < 64; t++) {
        final S1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
        final ch = (e & f) ^ ((~e) & g);
        final temp1 = (h + S1 + ch + k[t] + w[t]) & 0xFFFFFFFF;
        final S0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
        final maj = (a & b) ^ (a & c) ^ (b & c);
        final temp2 = (S0 + maj) & 0xFFFFFFFF;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) & 0xFFFFFFFF;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) & 0xFFFFFFFF;
      }

      h0 = (h0 + a) & 0xFFFFFFFF;
      h1 = (h1 + b) & 0xFFFFFFFF;
      h2 = (h2 + c) & 0xFFFFFFFF;
      h3 = (h3 + d) & 0xFFFFFFFF;
      h4 = (h4 + e) & 0xFFFFFFFF;
      h5 = (h5 + f) & 0xFFFFFFFF;
      h6 = (h6 + g) & 0xFFFFFFFF;
      h7 = (h7 + h) & 0xFFFFFFFF;
    }

    final out = Uint8List(32);
    final outBd = ByteData.view(out.buffer);
    outBd.setInt32(0, h0, Endian.big);
    outBd.setInt32(4, h1, Endian.big);
    outBd.setInt32(8, h2, Endian.big);
    outBd.setInt32(12, h3, Endian.big);
    outBd.setInt32(16, h4, Endian.big);
    outBd.setInt32(20, h5, Endian.big);
    outBd.setInt32(24, h6, Endian.big);
    outBd.setInt32(28, h7, Endian.big);

    return out;
  }

  static int _rotr(int x, int n) => ((x >>> n) | (x << (32 - n))) & 0xFFFFFFFF;
}
