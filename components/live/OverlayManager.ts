// OverlayManager.ts
// TypeScript interface for controlling livestream overlays

import { NativeModules } from "react-native";

const { FacebookLiveModule } = NativeModules;

export interface ScoreData {
  homeTeam: string;
  homeScore: number;
  awayTeam: string;
  awayScore: number;
}

export type OverlayId = "score" | "logo" | "sponsor";

/**
 * Livestream Overlay Manager
 *
 * Quản lý các overlay trên livestream:
 * - Score overlay (góc trên bên trái)
 * - Logo overlay (góc trên bên phải)
 * - Sponsor overlay (góc dưới bên phải)
 */
export class LivestreamOverlayManager {
  /**
   * Thiết lập overlay tỉ số
   * @example
   * await OverlayManager.setScore({
   *   homeTeam: 'Team A',
   *   homeScore: 15,
   *   awayTeam: 'Team B',
   *   awayScore: 12
   * });
   */
  static async setScore(data: ScoreData): Promise<void> {
    return FacebookLiveModule.setScoreOverlay(
      data.homeTeam,
      data.homeScore,
      data.awayTeam,
      data.awayScore
    );
  }

  /**
   * Cập nhật tỉ số (nhanh chóng hơn setScore)
   * @example
   * await OverlayManager.updateScore({
   *   homeTeam: 'Team A',
   *   homeScore: 16,
   *   awayTeam: 'Team B',
   *   awayScore: 12
   * });
   */
  static async updateScore(data: ScoreData): Promise<void> {
    return FacebookLiveModule.updateScore(
      data.homeTeam,
      data.homeScore,
      data.awayTeam,
      data.awayScore
    );
  }

  /**
   * Thiết lập logo overlay từ file path
   * @param logoPath Đường dẫn tuyệt đối đến file logo (png, jpg, ...)
   * @example
   * await OverlayManager.setLogo('/storage/emulated/0/logo.png');
   */
  static async setLogo(logoPath: string): Promise<void> {
    return FacebookLiveModule.setLogoOverlay(logoPath);
  }

  /**
   * Thiết lập logo overlay từ URL (recommended)
   * @param logoUrl URL của logo image (sẽ được download và cache)
   * @example
   * await OverlayManager.setLogoFromUrl('https://example.com/logo.png');
   */
  static async setLogoFromUrl(logoUrl: string): Promise<void> {
    return FacebookLiveModule.setLogoOverlayFromUrl(logoUrl);
  }

  /**
   * Thiết lập danh sách nhà tài trợ
   * @param sponsors Mảng tên nhà tài trợ
   * @example
   * await OverlayManager.setSponsors(['Nike', 'Adidas', 'Puma']);
   */
  static async setSponsors(sponsors: string[]): Promise<void> {
    return FacebookLiveModule.setSponsorsOverlay(sponsors);
  }

  /**
   * Cập nhật danh sách nhà tài trợ
   * @example
   * await OverlayManager.updateSponsors(['Nike', 'Coca-Cola']);
   */
  static async updateSponsors(sponsors: string[]): Promise<void> {
    return FacebookLiveModule.updateSponsors(sponsors);
  }

  /**
   * Hiển thị một overlay
   * @param overlayId ID của overlay: 'score', 'logo', hoặc 'sponsor'
   * @example
   * await OverlayManager.show('score');
   */
  static async show(overlayId: OverlayId): Promise<void> {
    return FacebookLiveModule.showOverlay(overlayId);
  }

  /**
   * Ẩn một overlay
   * @param overlayId ID của overlay
   * @example
   * await OverlayManager.hide('score');
   */
  static async hide(overlayId: OverlayId): Promise<void> {
    return FacebookLiveModule.hideOverlay(overlayId);
  }

  /**
   * Bật/tắt một overlay
   * @param overlayId ID của overlay
   * @returns Trạng thái mới (true = hiển thị, false = ẩn)
   * @example
   * const isVisible = await OverlayManager.toggle('logo');
   * console.log('Logo is now', isVisible ? 'visible' : 'hidden');
   */
  static async toggle(overlayId: OverlayId): Promise<boolean> {
    return FacebookLiveModule.toggleOverlay(overlayId);
  }

  /**
   * Kiểm tra overlay có đang hiển thị không
   * @param overlayId ID của overlay
   * @returns true nếu đang hiển thị
   * @example
   * const visible = await OverlayManager.isVisible('score');
   */
  static async isVisible(overlayId: OverlayId): Promise<boolean> {
    return FacebookLiveModule.isOverlayVisible(overlayId);
  }

  /**
   * Xóa một overlay
   * @param overlayId ID của overlay
   * @example
   * await OverlayManager.remove('sponsor');
   */
  static async remove(overlayId: OverlayId): Promise<void> {
    return FacebookLiveModule.removeOverlay(overlayId);
  }

  /**
   * Xóa tất cả overlays
   * @example
   * await OverlayManager.clearAll();
   */
  static async clearAll(): Promise<void> {
    return FacebookLiveModule.clearAllOverlays();
  }

  /**
   * Setup đầy đủ cho một trận đấu
   * @example
   * await OverlayManager.setupMatch({
   *   score: {
   *     homeTeam: 'Team A',
   *     homeScore: 0,
   *     awayTeam: 'Team B',
   *     awayScore: 0
   *   },
   *   logoUrl: 'https://example.com/logo.png',  // Recommend: dùng URL
   *   // or logoPath: '/storage/emulated/0/logo.png',  // Hoặc dùng file path
   *   sponsors: ['Nike', 'Adidas', 'Red Bull']
   * });
   */
  static async setupMatch(config: {
    score?: ScoreData;
    logoPath?: string;
    logoUrl?: string; // Recommend: dùng này
    sponsors?: string[];
  }): Promise<void> {
    const promises: Promise<any>[] = [];

    if (config.score) {
      promises.push(this.setScore(config.score));
    }

    if (config.logoUrl) {
      promises.push(this.setLogoFromUrl(config.logoUrl));
    } else if (config.logoPath) {
      promises.push(this.setLogo(config.logoPath));
    }

    if (config.sponsors && config.sponsors.length > 0) {
      promises.push(this.setSponsors(config.sponsors));
    }

    await Promise.all(promises);
  }

  /**
   * Hiển thị tất cả overlays đã setup
   * @example
   * await OverlayManager.showAll();
   */
  static async showAll(): Promise<void> {
    await Promise.all([
      this.show("score").catch(() => {}),
      this.show("logo").catch(() => {}),
      this.show("sponsor").catch(() => {}),
    ]);
  }

  /**
   * Ẩn tất cả overlays
   * @example
   * await OverlayManager.hideAll();
   */
  static async hideAll(): Promise<void> {
    await Promise.all([
      this.hide("score").catch(() => {}),
      this.hide("logo").catch(() => {}),
      this.hide("sponsor").catch(() => {}),
    ]);
  }
}

// Export default cho convenience
export default LivestreamOverlayManager;

/**
 * React Hook để quản lý overlays
 * @example
 * function MyLiveStream() {
 *   const {
 *     setScore,
 *     updateScore,
 *     toggleOverlay,
 *     setupMatch
 *   } = useOverlayManager();
 *
 *   useEffect(() => {
 *     setupMatch({
 *       score: { homeTeam: 'A', homeScore: 0, awayTeam: 'B', awayScore: 0 },
 *       logoPath: '/path/to/logo.png',
 *       sponsors: ['Nike', 'Adidas']
 *     });
 *   }, []);
 *
 *   return <View>...</View>;
 * }
 */
export function useOverlayManager() {
  return {
    setScore: LivestreamOverlayManager.setScore,
    updateScore: LivestreamOverlayManager.updateScore,
    setLogo: LivestreamOverlayManager.setLogo,
    setLogoFromUrl: LivestreamOverlayManager.setLogoFromUrl,
    setSponsors: LivestreamOverlayManager.setSponsors,
    updateSponsors: LivestreamOverlayManager.updateSponsors,
    show: LivestreamOverlayManager.show,
    hide: LivestreamOverlayManager.hide,
    toggle: LivestreamOverlayManager.toggle,
    isVisible: LivestreamOverlayManager.isVisible,
    remove: LivestreamOverlayManager.remove,
    clearAll: LivestreamOverlayManager.clearAll,
    setupMatch: LivestreamOverlayManager.setupMatch,
    showAll: LivestreamOverlayManager.showAll,
    hideAll: LivestreamOverlayManager.hideAll,
  };
}
