// DHAVParserTests.swift — parity test against imou-pb-enc2.raw fixture.

import XCTest
@testable import ImouRnNative

final class DHAVParserTests: XCTestCase {

  private func loadFixture(_ name: String) -> Data {
    let url = Bundle(for: type(of: self)).url(forResource: name, withExtension: "raw")!
    return try! Data(contentsOf: url)
  }

  func testWalkerFindsB95PastUnknown0x26() {
    // Real ext where 0x26 sits before 0x95 — Session 8 fix required for walker.
    let ext = Data([
      0x82, 0, 0, 0, 0x40, 0x0b, 0x54, 0x06,
      0x81, 0x3c, 0x0c, 0x0f,
      0xa0, 0,
      0x26, 0x01,
      0x95, 0, 0, 0, 0, 0x01, 0, 0,
      0xb3, 0x08, 0xb0, 0x1a, 0x8c, 0, 0x11, 0xe2,
    ])
    XCTAssertTrue(DHAVParser.hasExtType(ext, 0x95),
                  "walker must find 0x95 even with unknown 0x26 in between")
  }

  func testDecryptFirstIframeOfEnc2Fixture() {
    let data = loadFixture("imou-pb-enc2")
    let size = data.withUnsafeBytes {
      Int($0.load(fromByteOffset: 12, as: UInt32.self).littleEndian)
    }
    let frame = data.prefix(size)
    let key = CryptoCore.vodFrameKey(devSn: "5858CBDPSF15233", devPwd: "L28F4128")

    let dec = DHAVParser.decryptVodFrame(frame, key: key)

    let extHdrLen = Int(dec[dec.startIndex + 0x16])
    let pStart = dec.startIndex + 0x18 + extHdrLen
    let first32 = dec.subdata(in: pStart..<(pStart + 32))
    let hex = first32.map { String(format: "%02x", $0) }.joined()
    XCTAssertEqual(hex,
      "0000000140010c01ffff01600000030000030000030000030096ac0900000001")
  }

  func testAssemblerYieldsManyFramesAllIframesStartWithNAL() {
    let data = loadFixture("imou-pb-enc2")
    let key = CryptoCore.vodFrameKey(devSn: "5858CBDPSF15233", devPwd: "L28F4128")
    let asm = DHAVParser.Assembler(key: key)
    asm.push(data)
    let frames = asm.popFrames()
    XCTAssertGreaterThan(frames.count, 100)

    for f in frames where f[f.startIndex + 4] == 0xfd {
      let eh = Int(f[f.startIndex + 0x16])
      let p = f.startIndex + 0x18 + eh
      XCTAssertEqual(f[p],     0x00)
      XCTAssertEqual(f[p + 1], 0x00)
      XCTAssertEqual(f[p + 2], 0x00)
      XCTAssertEqual(f[p + 3], 0x01)
    }
  }
}
