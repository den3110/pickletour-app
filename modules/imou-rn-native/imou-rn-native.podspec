require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'imou-rn-native'
  s.version      = package['version']
  s.summary      = package['description']
  s.description  = package['description']
  s.homepage     = 'https://example.com/imou-rn-native'
  s.license      = 'MIT'
  s.authors      = { 'imou-rn-native' => 'noreply@example.com' }
  # iOS 15.0+ — async URLSession.data(for:) + AVSampleBufferDisplayLayer
  # used by HEVCRenderer. iOS 15 covers iPhone 6s+ which is ~99% market.
  s.platforms    = { :ios => '15.0' }
  s.source       = { :git => 'https://example.com/imou-rn-native.git', :tag => "#{s.version}" }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.exclude_files = 'ios/Tests/**/*'
  s.swift_version = '5.0'

  s.dependency 'React-Core'

  # No FFmpegKit dependency: pipeline uses AVSampleBufferDisplayLayer
  # (VideoToolbox HEVC) + AudioToolbox (AAC) directly. Bundle stays slim.
  # CoreMedia, VideoToolbox, AVFoundation, AudioToolbox, CoreImage are all
  # system frameworks — no extra link needed.

  s.frameworks = 'AVFoundation', 'CoreMedia', 'VideoToolbox',
                 'AudioToolbox', 'CoreImage', 'Security'

  s.pod_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited) -ObjC',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) IMOU_RN_NATIVE=1',
  }
end
