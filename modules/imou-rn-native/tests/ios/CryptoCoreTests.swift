// CryptoCoreTests.swift — parity tests against imou-pkg Python reference.

import XCTest
@testable import ImouRnNative

final class CryptoCoreTests: XCTestCase {

  func testVodFrameKeyMatchesPython() {
    let k = CryptoCore.vodFrameKey(devSn: "5858CBDPSF15233", devPwd: "L28F4128")
    XCTAssertEqual(k.count, 16)
    let hex = k.map { String(format: "%02x", $0) }.joined()
    XCTAssertEqual(hex, "70263a9c67009bf2d67aee495c25f5b0")
  }

  func testVodFrameKeyEnc3MatchesPython() {
    let k = CryptoCore.vodFrameKeyEnc3(devSn: "5858CBDPSF15233", devPwd: "L28F4128")
    XCTAssertEqual(k.count, 32)
    let hex = k.map { String(format: "%02x", $0) }.joined()
    XCTAssertEqual(hex,
      "70263a9c67009bf2d67aee495c25f5b0a12f98952d24ea5f99c8c5e706c0631d")
  }

  func testEnc3KeyFirst16EqualsEnc2Key() {
    let sn = "5858CBDPSF15233"; let pw = "L28F4128"
    let k16 = CryptoCore.vodFrameKey(devSn: sn, devPwd: pw)
    let k32 = CryptoCore.vodFrameKeyEnc3(devSn: sn, devPwd: pw)
    XCTAssertEqual(k16, k32.prefix(16))
  }

  func testWsseToken() {
    let nonce = Data(repeating: 0, count: 16)
    let now = ISO8601DateFormatter().date(from: "2026-06-01T09:21:42Z")!
    let t = CryptoCore.makeWsseToken(devPwd: "L28F4128",
                                     nonceBytes: nonce,
                                     now: now)
    XCTAssertEqual(t.nonceHex, "00000000000000000000000000000000")
    XCTAssertEqual(t.created, "2026-06-01T09:21:42Z")
    // Verified via Python: base64(SHA1(nonceHex + created + devPwd))
    XCTAssertEqual(t.passwordDigest, "CU0AQEUqwtmnhRgcQO9hji7FORU=")
  }

  func testMd5HexLower() {
    XCTAssertEqual(CryptoCore.md5HexLower(Data("".utf8)), "d41d8cd98f00b204e9800998ecf8427e")
    XCTAssertEqual(CryptoCore.md5HexLower(Data("a".utf8)), "0cc175b9c0f1b6a831c399e269772661")
  }
}
