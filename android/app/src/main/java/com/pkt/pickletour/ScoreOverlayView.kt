package com.pkt.pickletour

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Region
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * Native overlay view thay thế cho ScoreOverlay.jsx (web).
 *
 * ✅ Refactor anti-crash:
 * - KHÔNG addView/removeView/removeAllViews trong updateState()/updateStateInternal()
 * - Tất cả layout con được build & add sẵn trong init
 * - updateState chỉ đổi visibility + setText + load ảnh
 *
 * ✅ Hardening thêm (fix tận gốc crash IndexOutOfBounds trong gatherTransparentRegion):
 * - Conflate update chuẩn (không post chồng + không rơi update)
 * - Chặn update khi view đã detach
 * - Override gatherTransparentRegion/draw/dispatchDraw để chặn crash từ framework nếu xảy ra edge-case
 */
class ScoreOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    companion object {
        private val imageLoadExecutor = Executors.newFixedThreadPool(3)
        private const val MAX_SPONSORS = 12
        private const val MAX_SETS = 12
    }

    // =============== Static config từ overlayLoad ===============
    private var corner: String = "tl" // "tl" | "tr" | "bl" | "br"
    private var scaleScore: Float = 1f
    private var marginX: Int = dp(16)
    private var marginY: Int = dp(16)

    // overlayVersion:
    // 0: normal scoreboard
    // 1: default V1
    // 2: default V2
    private var overlayVersion: Int = 0

    // ✅ Conflate update (hardened)
    private var pendingUpdateData: ReadableMap? = null
    private val updateHandler = Handler(Looper.getMainLooper())
    private val UPDATE_DEBOUNCE_MS = 50L
    private val flushRunnable = Runnable { flushPendingUpdate() }
    private var isUpdating = false
    private var flushScheduled = false
    private var isAttachedSafe = false

    // =============== Views chung ===============
    private val cardNormal: LinearLayout = LinearLayout(context)
    private val cardBreak: LinearLayout = LinearLayout(context)
    private val cardDefault: LinearLayout = LinearLayout(context) // overlayVersion=1
    private val cardDefaultV2: LinearLayout = LinearLayout(context) // overlayVersion=2
    private val midRowV2: LinearLayout = LinearLayout(context)

    // Normal card views
    private val tvTourName: TextView = TextView(context)
    private val ivTourLogo: ImageView = ImageView(context)
    private val tvPhase: TextView = TextView(context)

    private val tvNameA: TextView = TextView(context)
    private val tvScoreA: TextView = TextView(context)
    private val tvNameB: TextView = TextView(context)
    private val tvScoreB: TextView = TextView(context)

    private val serveBallsA: LinearLayout = LinearLayout(context)
    private val serveBallsB: LinearLayout = LinearLayout(context)

    // Accent pills (để update màu khi accent đổi)
    private val pillA: View = View(context)
    private val pillB: View = View(context)

    // Sets
    private val setsHeaderRow: LinearLayout = LinearLayout(context)
    private val setsRowA: LinearLayout = LinearLayout(context)
    private val setsRowB: LinearLayout = LinearLayout(context)
    private val setHeaderCells: MutableList<TextView> = mutableListOf()
    private val setRowACells: MutableList<TextView> = mutableListOf()
    private val setRowBCells: MutableList<TextView> = mutableListOf()

    // Break card
    private val tvBreakTourName: TextView = TextView(context)
    private val ivBreakLogo: ImageView = ImageView(context)
    private val tvBreakCourt: TextView = TextView(context)
    private val tvBreakTitle: TextView = TextView(context)
    private val tvBreakDesc: TextView = TextView(context)
    private val tvBreakNote: TextView = TextView(context)
    private val tvBreakTeams: TextView = TextView(context)
    private val tvBreakRound: TextView = TextView(context)

    // Default card V1
    private val tvDefaultTitle: TextView = TextView(context)
    private val tvDefaultNameA: TextView = TextView(context)
    private val tvDefaultScoreA: TextView = TextView(context)
    private val tvDefaultNameB: TextView = TextView(context)
    private val tvDefaultScoreB: TextView = TextView(context)

    // Default card V2
    private val tvDefaultV2Top: TextView = TextView(context)
    private val tvDefaultV2Bottom: TextView = TextView(context)
    private val ivDefaultV2Logo: ImageView = ImageView(context)
    private val tvDefaultV2SeedA: TextView = TextView(context)
    private val tvDefaultV2SeedB: TextView = TextView(context)
    private val tvDefaultV2NameA: TextView = TextView(context)
    private val tvDefaultV2ScoreA: TextView = TextView(context)
    private val tvDefaultV2NameB: TextView = TextView(context)
    private val tvDefaultV2ScoreB: TextView = TextView(context)
    private val v2ServeDotA: LinearLayout = LinearLayout(context)
    private val v2ServeDotB: LinearLayout = LinearLayout(context)

    // Clock + logo web + sponsors
    private val tvClock: TextView = TextView(context)
    private val ivWebLogo: ImageView = ImageView(context)
    private val sponsorsRow: LinearLayout = LinearLayout(context)
    private val sponsorSlots: List<ImageView> = List(MAX_SPONSORS) { ImageView(context) }

    // Cache URL
    private var cachedWebLogoUrl: String = ""
    private var cachedSponsorUrls: List<String> = emptyList()
    private var cachedTournamentLogoUrl: String = ""
    private var cachedBreakLogoUrl: String = ""

    // State/Theme
    private var theme: String = "dark"
    private var size: String = "md"
    private var accentA: Int = Color.parseColor("#25C2A0")
    private var accentB: Int = Color.parseColor("#4F46E5")
    private var roundedPx: Float = dp(18).toFloat()
    private var shadowOn: Boolean = true
    private var showSets: Boolean = true
    private var nameScale: Float = 1f
    private var scoreScale: Float = 1f
    private var showClock: Boolean = false
    private var overlayEnabled: Boolean = false
    private var lastRoundedApplied: Float = roundedPx

    // Serve indicator cache
    private var lastServeSide: String? = null
    private var lastServeCount: Int = -1
    private var lastServeSideV2: String? = null
    private var lastServeCountV2: Int = -1
    private val serveBallViewsA: Array<View?> = arrayOfNulls(2)
    private val serveBallViewsB: Array<View?> = arrayOfNulls(2)
    private val v2DotViewsA: Array<View?> = arrayOfNulls(2)
    private val v2DotViewsB: Array<View?> = arrayOfNulls(2)

    private val V2_GREEN = Color.parseColor("#22c55e")
    private val V2_GREY = Color.parseColor("#4b5563")

    // Sets caching (perf)
    private var lastSetsHash: Int = 0
    private var lastSetsAccentA: Int = accentA
    private var lastSetsAccentB: Int = accentB
    private var lastSetsVisibleCount: Int = 0

    // ✅ FIX co-width (Default V2)
    private var fixedV2WidthPx: Int = dp(380)

    private fun computeFixedV2WidthPx(): Int {
        return when (size) {
            "lg" -> dp(420)
            "sm" -> dp(340)
            else -> dp(380)
        }
    }

    // Clock timer
    private val clockHandler = Handler(Looper.getMainLooper())
    private var clockRunning = false
    private val clockRunnable =
        object : Runnable {
            override fun run() {
                if (!clockRunning) return
                val now = System.currentTimeMillis()
                tvClock.text = android.text.format.DateFormat.format("HH:mm:ss", now)
                clockHandler.postDelayed(this, 1000L)
            }
        }

    private var built = false

    init {
        // ✅ giảm nguy cơ tạo layer/texture lớn
        setLayerType(LAYER_TYPE_NONE, null)
        setWillNotDraw(true)
        setBackgroundColor(Color.TRANSPARENT)

        buildLayoutOnce()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isAttachedSafe = true
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()

        isAttachedSafe = false

        updateHandler.removeCallbacks(flushRunnable)
        flushScheduled = false
        pendingUpdateData = null

        clockRunning = false
        clockHandler.removeCallbacks(clockRunnable)

        ivTourLogo.tag = null
        ivBreakLogo.tag = null
        ivWebLogo.tag = null
        ivDefaultV2Logo.tag = null
        sponsorSlots.forEach { it.tag = null }
    }

    // =============== Public API ===============
    fun configureLayout(corner: String, scaleScore: Float, marginXDp: Int, marginYDp: Int) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            post { configureLayout(corner, scaleScore, marginXDp, marginYDp) }
            return
        }
        this.corner = corner.ifBlank { "tl" }.lowercase()
        this.scaleScore = scaleScore.coerceIn(0.25f, 4f)
        this.marginX = dp(marginXDp)
        this.marginY = dp(marginYDp)
        applyCornerAndScale()
    }

    /** ✅ updateState: tuyệt đối không add/remove view. Chỉ enqueue data và flush bằng debounce. */
    fun updateState(map: ReadableMap) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            post { updateState(map) }
            return
        }
        if (!isAttachedSafe) return

        pendingUpdateData = map

        // chỉ schedule 1 lần, data mới sẽ overwrite pendingUpdateData
        if (!flushScheduled) {
            flushScheduled = true
            updateHandler.removeCallbacks(flushRunnable)
            updateHandler.postDelayed(flushRunnable, UPDATE_DEBOUNCE_MS)
        }
    }

    private fun flushPendingUpdate() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            post { flushPendingUpdate() }
            return
        }

        flushScheduled = false
        if (!isAttachedSafe) {
            pendingUpdateData = null
            return
        }

        if (isUpdating) {
            // đang update thì dời lại frame sau
            flushScheduled = true
            updateHandler.postDelayed(flushRunnable, 16L)
            return
        }

        val data = pendingUpdateData ?: return
        pendingUpdateData = null

        updateStateInternal(data)

        // nếu trong lúc update có data mới -> chạy tiếp ngay
        if (pendingUpdateData != null && isAttachedSafe) {
            flushScheduled = true
            updateHandler.removeCallbacks(flushRunnable)
            updateHandler.postDelayed(flushRunnable, 0L)
        }
    }

    private fun updateStateInternal(map: ReadableMap) {
        if (isUpdating || !isAttachedSafe) return
        isUpdating = true

        try {
            theme = map.getStringOrNull("theme")?.lowercase() ?: "dark"
            size = map.getStringOrNull("size")?.lowercase() ?: "md"
            fixedV2WidthPx = computeFixedV2WidthPx()

            accentA = parseColorSafe(map.getStringOrNull("accentA"), Color.parseColor("#25C2A0"))
            accentB = parseColorSafe(map.getStringOrNull("accentB"), Color.parseColor("#4F46E5"))
            val stageName = map.getStringOrNull("stageName") ?: ""

            val roundedValue = map.getIntOr("rounded", 18)
            roundedPx = dp(roundedValue).toFloat()

            overlayVersion = map.getIntOr("overlayVersion", overlayVersion)

            shadowOn = map.getBooleanOr("shadow", true)
            showSets = map.getBooleanOr("showSets", true)
            nameScale = map.getDoubleOr("nameScale", 1.0).toFloat().coerceIn(0.5f, 2.5f)
            scoreScale = map.getDoubleOr("scoreScale", 1.0).toFloat().coerceIn(0.5f, 3.5f)

            if (map.hasKey("scaleScore") && !map.isNull("scaleScore")) {
                scaleScore = map.getDouble("scaleScore").toFloat().coerceIn(0.25f, 4f)
            }

            overlayEnabled = map.getBooleanOr("overlayEnabled", false)
            showClock = map.getBooleanOr("showClock", false)

            val tourName = map.getStringOrNull("tournamentName") ?: ""
            val courtName = map.getStringOrNull("courtName") ?: ""
            val tourLogoUrl = map.getStringOrNull("tournamentLogoUrl") ?: ""
            val phaseText = map.getStringOrNull("phaseText") ?: ""
            val roundLabel = map.getStringOrNull("roundLabel") ?: ""

            val teamAName = map.getStringOrNull("teamAName") ?: "Team A"
            val teamBName = map.getStringOrNull("teamBName") ?: "Team B"
            val scoreA = map.getIntOr("scoreA", 0)
            val scoreB = map.getIntOr("scoreB", 0)

            val serveSide = map.getStringOrNull("serveSide")?.uppercase()
            val serveCount = map.getIntOr("serveCount", 1).coerceIn(1, 2)

            val isBreak = map.getBooleanOr("isBreak", false)
            val breakNote = map.getStringOrNull("breakNote") ?: ""
            val breakTeams = map.getStringOrNull("breakTeams") ?: "$teamAName vs $teamBName"
            val breakRound = map.getStringOrNull("breakRound") ?: (roundLabel.ifBlank { phaseText })

            val isDefaultDesignV1 =
                (overlayVersion == 1) || map.getBooleanOr("isDefaultDesign", false)
            val isDefaultDesignV2 = (overlayVersion == 2)

            val webLogoUrl = map.getStringOrNull("webLogoUrl") ?: ""
            val sponsors = map.getArrayOrNull("sponsorLogos")

            // rounded background only when changed
            if (roundedPx != lastRoundedApplied) {
                lastRoundedApplied = roundedPx
                cardNormal.background = makeCardBackground()
                cardBreak.background = makeCardBackground()
            }

            // update pill colors when accent changes
            (pillA.background as? GradientDrawable)?.setColor(accentA)
            (pillB.background as? GradientDrawable)?.setColor(accentB)

            applyThemeToCards()
            applyDefaultCardStyleForV1()

            // Normal card
            tvTourName.text = if (tourName.isNotBlank()) tourName else "—"
            tvPhase.text = if (phaseText.isNotBlank()) phaseText else roundLabel
            tvNameA.text = teamAName
            tvNameB.text = teamBName
            tvScoreA.text = scoreA.toString()
            tvScoreB.text = scoreB.toString()

            updateServe(serveSide, serveCount)
            updateServeV2(serveSide, serveCount)

            // Sets (✅ no rebuild/remove)
            val setsArr = map.getArrayOrNull("sets")
            updateSetsSafe(setsArr)

            // Break card
            tvBreakTourName.text = if (tourName.isNotBlank()) tourName else "Giải đấu"
            tvBreakCourt.text = if (courtName.isNotBlank()) "Sân: $courtName" else ""
            tvBreakTitle.text = "ĐANG TẠM NGHỈ"
            tvBreakDesc.text = "Chờ trọng tài bắt đầu game tiếp theo..."
            tvBreakNote.text = breakNote
            tvBreakNote.visibility = if (breakNote.isNotBlank()) View.VISIBLE else View.GONE
            tvBreakTeams.text = breakTeams
            tvBreakRound.text = breakRound

            // Default V1
            val topTitle = tourName.ifBlank { "GIẢI PICKLEBALL" }.uppercase()
            tvDefaultTitle.text = topTitle
            tvDefaultNameA.text = teamAName.uppercase()
            tvDefaultNameB.text = teamBName.uppercase()
            tvDefaultScoreA.text = scoreA.toString()
            tvDefaultScoreB.text = scoreB.toString()

            // Default V2
            tvDefaultV2Top.text = topTitle
            tvDefaultV2NameA.text = teamAName.uppercase()
            tvDefaultV2NameB.text = teamBName.uppercase()
            tvDefaultV2ScoreA.text = scoreA.toString()
            tvDefaultV2ScoreB.text = scoreB.toString()
            tvDefaultV2Bottom.text = stageName.uppercase()
            tvDefaultV2Bottom.visibility = if (stageName.isNotBlank()) View.VISIBLE else View.GONE

            val seedA = map.getIntOrNullable("seedA")
            val seedB = map.getIntOrNullable("seedB")
            if (seedA != null && seedA > 0) {
                tvDefaultV2SeedA.text = seedA.toString()
                tvDefaultV2SeedA.visibility = View.VISIBLE
            } else tvDefaultV2SeedA.visibility = View.GONE
            if (seedB != null && seedB > 0) {
                tvDefaultV2SeedB.text = seedB.toString()
                tvDefaultV2SeedB.visibility = View.VISIBLE
            } else tvDefaultV2SeedB.visibility = View.GONE

            // Logos
            if (tourLogoUrl != cachedTournamentLogoUrl) {
                cachedTournamentLogoUrl = tourLogoUrl
                ivTourLogo.loadUrlSafe(tourLogoUrl)
                ivDefaultV2Logo.loadUrlSafe(tourLogoUrl)
            }
            if (tourLogoUrl != cachedBreakLogoUrl) {
                cachedBreakLogoUrl = tourLogoUrl
                ivBreakLogo.loadUrlSafe(tourLogoUrl)
            }

            val shouldShowWebLogo = overlayEnabled && webLogoUrl.isNotBlank()
            ivWebLogo.visibility = if (shouldShowWebLogo) View.VISIBLE else View.GONE
            if (shouldShowWebLogo && webLogoUrl != cachedWebLogoUrl) {
                cachedWebLogoUrl = webLogoUrl
                ivWebLogo.loadUrlSafe(webLogoUrl)
            }

            // Sponsors (✅ no add/remove)
            val newSponsorUrls =
                sponsors?.let { arr ->
                    (0 until min(arr.size(), MAX_SPONSORS)).mapNotNull { i ->
                        arr.getStringOrNull(i)
                    }
                } ?: emptyList()

            if (newSponsorUrls != cachedSponsorUrls) {
                cachedSponsorUrls = newSponsorUrls
            }
            updateSponsorsRowSafe(newSponsorUrls)

            // Show card
            when {
                isBreak -> {
                    cardBreak.visibility = View.VISIBLE
                    cardDefault.visibility = View.GONE
                    cardDefaultV2.visibility = View.GONE
                    cardNormal.visibility = View.GONE
                }

                isDefaultDesignV2 -> {
                    cardBreak.visibility = View.GONE
                    cardDefault.visibility = View.GONE
                    cardDefaultV2.visibility = View.VISIBLE
                    cardNormal.visibility = View.GONE

                    val lp = (cardDefaultV2.layoutParams as? LayoutParams)
                    if (lp != null) {
                        if (lp.width != fixedV2WidthPx) {
                            lp.width = fixedV2WidthPx
                            cardDefaultV2.layoutParams = lp
                        }
                    } else {
                        cardDefaultV2.layoutParams =
                            LayoutParams(fixedV2WidthPx, LayoutParams.WRAP_CONTENT)
                    }
                    syncDefaultV2BarsWidth()
                }

                isDefaultDesignV1 -> {
                    cardBreak.visibility = View.GONE
                    cardDefault.visibility = View.VISIBLE
                    cardDefaultV2.visibility = View.GONE
                    cardNormal.visibility = View.GONE
                }

                else -> {
                    cardBreak.visibility = View.GONE
                    cardDefault.visibility = View.GONE
                    cardDefaultV2.visibility = View.GONE
                    cardNormal.visibility = View.VISIBLE
                }
            }

            updateClockVisibility()
            applyCornerAndScale()
        } catch (e: Throwable) {
            android.util.Log.e("ScoreOverlay", "❌ updateStateInternal crashed", e)
        } finally {
            isUpdating = false
        }
    }

    // ✅ Sponsors: tuyệt đối không add/remove trong update
    private fun updateSponsorsRowSafe(urls: List<String>) {
        try {
            if (!overlayEnabled || urls.isEmpty()) {
                sponsorsRow.visibility = View.GONE
                sponsorSlots.forEach { it.visibility = View.GONE }
                return
            }

            val baseSponsorHeight =
                when (size) {
                    "lg" -> dp(40)
                    "sm" -> dp(30)
                    else -> dp(36)
                }
            val sponsorHeight = (baseSponsorHeight * 2) / 3
            val baseSponsorMaxWidth = dp(120)
            val sponsorMaxWidth = (baseSponsorMaxWidth * 2) / 3

            sponsorsRow.visibility = View.VISIBLE

            for (i in 0 until MAX_SPONSORS) {
                val iv = sponsorSlots[i]
                if (i < urls.size) {
                    val lp = (iv.layoutParams as? LinearLayout.LayoutParams)
                    if (lp != null) lp.height = sponsorHeight
                    iv.maxHeight = sponsorHeight
                    iv.maxWidth = sponsorMaxWidth
                    iv.visibility = View.VISIBLE
                    iv.loadUrlSafe(urls[i])
                } else {
                    iv.visibility = View.GONE
                }
            }
        } catch (e: Throwable) {
            android.util.Log.e("ScoreOverlay", "❌ updateSponsorsRowSafe error", e)
        }
    }

    // =============== Layout xây dựng (init-only) ===============
    private fun buildLayoutOnce() {
        if (built) return
        built = true

        // CARD NORMAL
        cardNormal.orientation = LinearLayout.VERTICAL
        cardNormal.setPadding(dp(10), dp(8), dp(10), dp(8))
        cardNormal.background = makeCardBackground()
        cardNormal.elevation = if (shadowOn) dp(6).toFloat() else 0f
        cardNormal.setLayerType(LAYER_TYPE_NONE, null)

        val metaRow =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
            }

        ivTourLogo.apply {
            layoutParams = LinearLayout.LayoutParams(dp(18), dp(18))
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
        }

        tvTourName.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }

        val metaLeft =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
                addView(ivTourLogo)
                addView(
                    tvTourName.apply {
                        val lp =
                            LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.WRAP_CONTENT,
                                LinearLayout.LayoutParams.WRAP_CONTENT
                            )
                        lp.leftMargin = dp(6)
                        layoutParams = lp
                    }
                )
            }

        tvPhase.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setPadding(dp(6), dp(2), dp(6), dp(2))
            background = roundedBadgeBg(Color.parseColor("#334155"))
        }

        metaRow.addView(
            metaLeft,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        metaRow.addView(
            tvPhase,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(8) }
        )

        val rowA = makeTeamRow(tvNameA, tvScoreA, serveBallsA, pillA)
        val rowB = makeTeamRow(tvNameB, tvScoreB, serveBallsB, pillB)

        val setsWrap =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
                setsHeaderRow.orientation = LinearLayout.HORIZONTAL
                setsRowA.orientation = LinearLayout.HORIZONTAL
                setsRowB.orientation = LinearLayout.HORIZONTAL
                addView(setsHeaderRow)
                addView(setsRowA)
                addView(setsRowB)
            }

        // ✅ build sets skeleton once (no remove later in update)
        buildSetsSkeletonOnce()

        cardNormal.addView(metaRow)
        cardNormal.addView(rowA)
        cardNormal.addView(rowB)
        cardNormal.addView(setsWrap)

        // CARD BREAK
        cardBreak.orientation = LinearLayout.VERTICAL
        cardBreak.setPadding(dp(12), dp(10), dp(12), dp(10))
        cardBreak.background = makeCardBackground()
        cardBreak.elevation = if (shadowOn) dp(6).toFloat() else 0f
        cardBreak.setLayerType(LAYER_TYPE_NONE, null)

        val breakTop =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
            }

        ivBreakLogo.apply {
            layoutParams = LinearLayout.LayoutParams(dp(26), dp(26))
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
        }
        tvBreakTourName.apply {
            setTextColor(Color.parseColor("#9AA4AF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        tvBreakCourt.apply {
            setTextColor(Color.parseColor("#9AA4AF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }

        val breakTopText =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
                addView(tvBreakTourName)
                addView(tvBreakCourt)
            }

        breakTop.addView(ivBreakLogo)
        breakTop.addView(
            breakTopText,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(8) }
        )

        tvBreakTitle.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(0, dp(4), 0, dp(2))
        }
        tvBreakDesc.apply {
            setTextColor(Color.parseColor("#9AA4AF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }
        tvBreakNote.apply {
            setTextColor(Color.parseColor("#9AA4AF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }
        tvBreakTeams.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }
        tvBreakRound.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setPadding(dp(6), dp(2), dp(6), dp(2))
            background = roundedBadgeBg(Color.parseColor("#1f2937"))
        }

        val breakTeamsRow =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
                addView(tvBreakTeams)
                addView(
                    tvBreakRound,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { leftMargin = dp(6) }
                )
            }

        cardBreak.addView(breakTop)
        cardBreak.addView(tvBreakTitle)
        cardBreak.addView(tvBreakDesc)
        cardBreak.addView(tvBreakNote)
        cardBreak.addView(breakTeamsRow)

        // CARD DEFAULT V1
        cardDefault.orientation = LinearLayout.VERTICAL
        cardDefault.setPadding(0, 0, 0, 0)
        cardDefault.clipToOutline = true
        cardDefault.elevation = dp(8).toFloat()
        cardDefault.setLayerType(LAYER_TYPE_NONE, null)

        tvDefaultTitle.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(14), dp(6), dp(14), dp(6))
            paint.isFakeBoldText = true
            isAllCaps = true
        }
        val rowBaseA = makeDefaultRow(tvDefaultNameA, tvDefaultScoreA)
        val rowBaseB = makeDefaultRow(tvDefaultNameB, tvDefaultScoreB)
        cardDefault.addView(tvDefaultTitle)
        cardDefault.addView(rowBaseA)
        cardDefault.addView(rowBaseB)

        // CARD DEFAULT V2
        cardDefaultV2.orientation = LinearLayout.VERTICAL
        cardDefaultV2.setPadding(0, 0, 0, 0)
        cardDefaultV2.clipToOutline = true
        cardDefaultV2.elevation = dp(8).toFloat()
        cardDefaultV2.setLayerType(LAYER_TYPE_NONE, null)

        tvDefaultV2Top.apply {
            gravity = Gravity.CENTER
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            setTextColor(Color.BLACK)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            paint.isFakeBoldText = true
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            isAllCaps = true
            setPadding(dp(14), dp(4), dp(14), dp(4))
            background =
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dp(6).toFloat()
                    setColor(Color.WHITE)
                }
        }
        cardDefaultV2.addView(
            tvDefaultV2Top,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(2) }
        )

        midRowV2.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.BLACK)
            setPadding(dp(10), dp(4), dp(10), dp(4))
            setLayerType(LAYER_TYPE_NONE, null)
        }

        ivDefaultV2Logo.apply {
            val h = dp(52)
            layoutParams = LinearLayout.LayoutParams(dp(56), h).apply { rightMargin = dp(10) }
            scaleType = ImageView.ScaleType.CENTER_CROP
            adjustViewBounds = true
            visibility = View.GONE
        }
        midRowV2.addView(ivDefaultV2Logo)

        val namesColV2 =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams =
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setLayerType(LAYER_TYPE_NONE, null)
            }

        val serveBoxW = dp(26)

        // Row A
        val rowV2A =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(2), 0, dp(2))
                setLayerType(LAYER_TYPE_NONE, null)
            }
        tvDefaultV2SeedA.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            visibility = View.GONE
        }
        tvDefaultV2NameA.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            paint.isFakeBoldText = true
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        v2ServeDotA.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.VISIBLE
            minimumWidth = serveBoxW
            setLayerType(LAYER_TYPE_NONE, null)
        }

        rowV2A.addView(
            tvDefaultV2SeedA,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { rightMargin = dp(4) }
        )
        rowV2A.addView(
            tvDefaultV2NameA,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.125f)
        )
        rowV2A.addView(
            v2ServeDotA,
            LinearLayout.LayoutParams(serveBoxW, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                leftMargin = dp(4)
            }
        )

        // Row B
        val rowV2B =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(2), 0, dp(2))
                setLayerType(LAYER_TYPE_NONE, null)
            }
        tvDefaultV2SeedB.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            visibility = View.GONE
        }
        tvDefaultV2NameB.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            paint.isFakeBoldText = true
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        v2ServeDotB.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.VISIBLE
            minimumWidth = serveBoxW
            setLayerType(LAYER_TYPE_NONE, null)
        }

        rowV2B.addView(
            tvDefaultV2SeedB,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { rightMargin = dp(4) }
        )
        rowV2B.addView(
            tvDefaultV2NameB,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.125f)
        )
        rowV2B.addView(
            v2ServeDotB,
            LinearLayout.LayoutParams(serveBoxW, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                leftMargin = dp(4)
            }
        )

        namesColV2.addView(rowV2A)
        namesColV2.addView(rowV2B)
        midRowV2.addView(namesColV2)

        val scoreColV2 =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#41935d"))
                layoutParams =
                    LinearLayout.LayoutParams(dp(48), LinearLayout.LayoutParams.MATCH_PARENT)
                setLayerType(LAYER_TYPE_NONE, null)
            }
        tvDefaultV2ScoreA.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            paint.isFakeBoldText = true
            gravity = Gravity.CENTER
        }
        tvDefaultV2ScoreB.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            paint.isFakeBoldText = true
            gravity = Gravity.CENTER
        }
        val dividerV2 =
            View(context).apply {
                layoutParams =
                    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
                setBackgroundColor(Color.argb(77, 255, 255, 255))
            }
        scoreColV2.addView(
            tvDefaultV2ScoreA,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        )
        scoreColV2.addView(dividerV2)
        scoreColV2.addView(
            tvDefaultV2ScoreB,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        )
        midRowV2.addView(scoreColV2)

        cardDefaultV2.addView(
            midRowV2,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )

        tvDefaultV2Bottom.apply {
            gravity = Gravity.CENTER
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            setTextColor(Color.BLACK)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            paint.isFakeBoldText = true
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            isAllCaps = true
            setPadding(dp(14), dp(4), dp(14), dp(4))
            background =
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dp(6).toFloat()
                    setColor(Color.WHITE)
                }
            visibility = View.GONE
        }
        cardDefaultV2.addView(
            tvDefaultV2Bottom,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(2) }
        )

        // CLOCK
        tvClock.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setPadding(dp(8), dp(4), dp(8), dp(4))
            background = roundedBadgeBg(Color.parseColor("#111827"))
            visibility = View.GONE
            setLayerType(LAYER_TYPE_NONE, null)
        }

        // Web logo
        ivWebLogo.apply {
            layoutParams =
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.END
                    setMargins(dp(16), dp(16), dp(16), dp(16))
                }
            scaleType = ImageView.ScaleType.FIT_CENTER
            adjustViewBounds = true
            maxHeight = dp(48)
            visibility = View.GONE
        }

        // Sponsors row (✅ pre-add slots)
        sponsorsRow.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams =
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.BOTTOM or Gravity.START
                    setMargins(dp(16), dp(16), dp(16), dp(16))
                }
            visibility = View.GONE
            setLayerType(LAYER_TYPE_NONE, null)
        }
        sponsorSlots.forEachIndexed { idx, iv ->
            iv.apply {
                layoutParams =
                    LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(24))
                        .also { lp -> if (idx > 0) lp.rightMargin = dp(8) }
                scaleType = ImageView.ScaleType.FIT_CENTER
                adjustViewBounds = true
                setBackgroundColor(Color.TRANSPARENT)
                visibility = View.GONE
            }
            sponsorsRow.addView(iv)
        }

        // Add all top-level views once
        addView(cardNormal)
        addView(cardBreak)
        addView(cardDefault)
        addView(cardDefaultV2)
        addView(tvClock)
        addView(ivWebLogo)
        addView(sponsorsRow)

        cardBreak.visibility = View.GONE
        cardDefault.visibility = View.GONE
        cardDefaultV2.visibility = View.GONE

        // ✅ init serve dots once
        initServeIndicatorsOnce()
    }

    // ✅ sets skeleton once (MAX_SETS) - init only
    private fun buildSetsSkeletonOnce() {
        setsHeaderRow.removeAllViews()
        setsRowA.removeAllViews()
        setsRowB.removeAllViews()
        setHeaderCells.clear()
        setRowACells.clear()
        setRowBCells.clear()

        // header left empty
        setsHeaderRow.addView(makeSetHeaderCell(""))
        // row labels
        setsRowA.addView(makeSetTeamCell("A"))
        setsRowB.addView(makeSetTeamCell("B"))

        for (i in 0 until MAX_SETS) {
            val h = makeSetHeaderCell("S${i + 1}", false)
            setHeaderCells.add(h)
            setsHeaderRow.addView(h)

            val aCell = makeSetScoreCell("–", false, false, accentA)
            val bCell = makeSetScoreCell("–", false, false, accentB)
            setRowACells.add(aCell)
            setRowBCells.add(bCell)
            setsRowA.addView(aCell)
            setsRowB.addView(bCell)
        }

        setsHeaderRow.visibility = View.GONE
        setsRowA.visibility = View.GONE
        setsRowB.visibility = View.GONE
    }

    // =============== Helper create sub-views ===============
    private fun makeTeamRow(
        tvName: TextView,
        tvScore: TextView,
        serveBalls: LinearLayout,
        pill: View
    ): View {
        val row =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(4), 0, dp(4))
                setLayerType(LAYER_TYPE_NONE, null)
            }

        pill.apply {
            layoutParams = LinearLayout.LayoutParams(dp(10), dp(10))
            background =
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.WHITE)
                }
        }

        tvName.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        }

        serveBalls.orientation = LinearLayout.HORIZONTAL
        serveBalls.visibility = View.GONE
        serveBalls.setLayerType(LAYER_TYPE_NONE, null)

        val leftWrap =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setLayerType(LAYER_TYPE_NONE, null)
                addView(pill)
                addView(
                    tvName,
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(8)
                    }
                )
                addView(
                    serveBalls,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { leftMargin = dp(6) }
                )
            }

        tvScore.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            paint.isFakeBoldText = true
        }

        row.addView(
            leftWrap,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        row.addView(
            tvScore,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(12) }
        )

        return row
    }

    private fun makeDefaultRow(tvName: TextView, tvScore: TextView): View {
        val row =
            LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.BLACK)
                setPadding(dp(14), dp(6), dp(14), dp(6))
                setLayerType(LAYER_TYPE_NONE, null)
            }
        tvName.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            paint.isFakeBoldText = true
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        tvScore.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            paint.isFakeBoldText = true
        }
        row.addView(
            tvName,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        row.addView(tvScore)
        return row
    }

    // =============== Theme / corner / scale ===============
    private fun applyThemeToCards() {
        val bg = if (theme == "light") 0xCCFFFFFF.toInt() else 0xCC0B0F14.toInt()
        val fg = if (theme == "light") 0xFF0B0F14.toInt() else 0xFFE6EDF3.toInt()
        val muted = if (theme == "light") 0xFF5C6773.toInt() else 0xFF9AA4AF.toInt()

        (cardNormal.background as? GradientDrawable)?.setColor(bg)
        (cardBreak.background as? GradientDrawable)?.setColor(bg)

        tvTourName.setTextColor(fg)
        tvNameA.setTextColor(fg)
        tvNameB.setTextColor(fg)
        tvScoreA.setTextColor(fg)
        tvScoreB.setTextColor(fg)

        tvBreakTourName.setTextColor(muted)
        tvBreakCourt.setTextColor(muted)
        tvBreakDesc.setTextColor(muted)
        tvBreakNote.setTextColor(muted)

        val baseName =
            when (size) {
                "lg" -> 18f
                "sm" -> 14f
                else -> 16f
            } * nameScale
        val baseScore =
            when (size) {
                "lg" -> 28f
                "sm" -> 20f
                else -> 24f
            } * scoreScale
        val baseMeta =
            when (size) {
                "lg" -> 12f
                "sm" -> 10f
                else -> 11f
            }

        tvNameA.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseName)
        tvNameB.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseName)
        tvScoreA.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseScore)
        tvScoreB.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseScore)
        tvTourName.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseMeta)
        tvPhase.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseMeta)

        val elev = if (shadowOn) dp(8).toFloat() else 0f
        cardNormal.elevation = elev
        cardBreak.elevation = elev
        cardDefault.elevation = elev
        cardDefaultV2.elevation = elev
    }

    private fun applyDefaultCardStyleForV1() {
        try {
            val cardBg =
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = roundedPx
                    setColor(Color.BLACK)
                }
            cardDefault.background = cardBg
            cardDefault.clipToOutline = true

            val titleBg =
                GradientDrawable(
                    GradientDrawable.Orientation.LEFT_RIGHT,
                    intArrayOf(Color.parseColor("#17873b"), Color.parseColor("#0b0f14"))
                ).apply {
                    cornerRadii =
                        floatArrayOf(roundedPx, roundedPx, roundedPx, roundedPx, 0f, 0f, 0f, 0f)
                }
            tvDefaultTitle.background = titleBg
            tvDefaultTitle.setTextColor(Color.WHITE)
            tvDefaultTitle.paint.isFakeBoldText = true
        } catch (e: Throwable) {
            android.util.Log.e("ScoreOverlay", "❌ applyDefaultCardStyleForV1 error", e)
        }
    }

    private fun applyCornerAndScale() {
        val card =
            when {
                cardBreak.visibility == View.VISIBLE -> cardBreak
                cardDefaultV2.visibility == View.VISIBLE -> cardDefaultV2
                cardDefault.visibility == View.VISIBLE -> cardDefault
                else -> cardNormal
            }

        val params =
            (card.layoutParams as? LayoutParams)
                ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)

        val isTop = corner.contains("t")
        val isLeft = corner.contains("l")

        params.gravity =
            when {
                isTop && isLeft -> Gravity.TOP or Gravity.START
                isTop && !isLeft -> Gravity.TOP or Gravity.END
                !isTop && isLeft -> Gravity.BOTTOM or Gravity.START
                else -> Gravity.BOTTOM or Gravity.END
            }
        params.setMargins(marginX, marginY, marginX, marginY)
        card.layoutParams = params

        // pivot + scale (safe)
        card.post {
            if (!isAttachedSafe) return@post
            card.pivotX = if (isLeft) 0f else card.width.toFloat()
            card.pivotY = if (isTop) 0f else card.height.toFloat()
            card.scaleX = scaleScore
            card.scaleY = scaleScore
        }

        val clockParams =
            (tvClock.layoutParams as? LayoutParams)
                ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
        val clockBottomOffset = if (!isTop && !isLeft) dp(132) else dp(16)
        clockParams.gravity =
            when {
                corner.contains("b") && corner.contains("r") -> Gravity.BOTTOM or Gravity.END
                corner.contains("b") && corner.contains("l") -> Gravity.BOTTOM or Gravity.START
                corner.contains("t") && corner.contains("r") -> Gravity.TOP or Gravity.END
                else -> Gravity.TOP or Gravity.START
            }
        clockParams.setMargins(dp(16), dp(16), dp(16), clockBottomOffset)
        tvClock.layoutParams = clockParams
    }

    private fun syncDefaultV2BarsWidth() {
        if (cardDefaultV2.visibility != View.VISIBLE) return
        midRowV2.post {
            if (!isAttachedSafe) return@post
            val w = midRowV2.width
            if (w <= 0) return@post
            (tvDefaultV2Top.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
                if (lp.width != w) {
                    lp.width = w
                    tvDefaultV2Top.layoutParams = lp
                }
            }
            (tvDefaultV2Bottom.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
                if (lp.width != w) {
                    lp.width = w
                    tvDefaultV2Bottom.layoutParams = lp
                }
            }
        }
    }

    // =============== Serve / Sets / Clock ===============
    private fun initServeIndicatorsOnce() {
        initNormalServeContainer(serveBallsA, serveBallViewsA)
        initNormalServeContainer(serveBallsB, serveBallViewsB)
        initV2ServeContainer(v2ServeDotA, v2DotViewsA)
        initV2ServeContainer(v2ServeDotB, v2DotViewsB)
    }

    private fun initNormalServeContainer(container: LinearLayout, holder: Array<View?>) {
        // init-only
        container.removeAllViews()
        container.orientation = LinearLayout.HORIZONTAL
        container.setLayerType(LAYER_TYPE_NONE, null)
        for (i in 0..1) {
            val dot =
                View(context).apply {
                    layoutParams =
                        LinearLayout.LayoutParams(dp(8), dp(8)).also { lp ->
                            if (i > 0) lp.leftMargin = dp(4)
                        }
                    background =
                        GradientDrawable().apply {
                            shape = GradientDrawable.OVAL
                            setColor(Color.WHITE)
                        }
                    visibility = View.GONE
                }
            holder[i] = dot
            container.addView(dot)
        }
    }

    private fun initV2ServeContainer(container: LinearLayout, holder: Array<View?>) {
        // init-only
        container.removeAllViews()
        container.orientation = LinearLayout.HORIZONTAL
        container.gravity = Gravity.CENTER_VERTICAL
        container.setLayerType(LAYER_TYPE_NONE, null)
        for (i in 0..1) {
            val dot =
                View(context).apply {
                    layoutParams =
                        LinearLayout.LayoutParams(dp(8), dp(8)).also { lp ->
                            lp.leftMargin = if (i == 0) dp(4) else dp(3)
                        }
                    background =
                        GradientDrawable().apply {
                            shape = GradientDrawable.OVAL
                            setColor(V2_GREY)
                        }
                    visibility = View.INVISIBLE
                }
            holder[i] = dot
            container.addView(dot)
        }
    }

    private fun updateServe(serveSide: String?, serveCount: Int) {
        val side = serveSide?.uppercase()
        val count = serveCount.coerceIn(1, 2)
        if (side == lastServeSide && count == lastServeCount) return
        lastServeSide = side
        lastServeCount = count

        val showA = side == "A"
        val showB = side == "B"
        serveBallsA.visibility = if (showA) View.VISIBLE else View.GONE
        serveBallsB.visibility = if (showB) View.VISIBLE else View.GONE

        if (showA) for (i in 0..1) serveBallViewsA[i]?.visibility =
            if (i < count) View.VISIBLE else View.GONE
        if (showB) for (i in 0..1) serveBallViewsB[i]?.visibility =
            if (i < count) View.VISIBLE else View.GONE
    }

    private fun updateServeV2(serveSide: String?, serveCount: Int) {
        val side = serveSide?.uppercase()
        val count = serveCount.coerceIn(1, 2)
        if (side == lastServeSideV2 && count == lastServeCountV2) return
        lastServeSideV2 = side
        lastServeCountV2 = count

        val activeA = side == "A"
        val activeB = side == "B"

        for (i in 0..1) {
            v2DotViewsA[i]?.let { a ->
                val on = activeA && i < count
                (a.background as? GradientDrawable)?.setColor(if (on) V2_GREEN else V2_GREY)
                a.visibility = if (on) View.VISIBLE else View.INVISIBLE
            }
            v2DotViewsB[i]?.let { b ->
                val on = activeB && i < count
                (b.background as? GradientDrawable)?.setColor(if (on) V2_GREEN else V2_GREY)
                b.visibility = if (on) View.VISIBLE else View.INVISIBLE
            }
        }
    }

    // ✅ Sets update không rebuild/remove
    private fun updateSetsSafe(arr: ReadableArray?) {
        if (!showSets || arr == null || arr.size() == 0) {
            setsHeaderRow.visibility = View.GONE
            setsRowA.visibility = View.GONE
            setsRowB.visibility = View.GONE
            lastSetsVisibleCount = 0
            lastSetsHash = 0
            return
        }

        val visibleCount = min(arr.size(), MAX_SETS)
        val hash = computeSetsHash(arr, visibleCount)
        val needColorUpdate = (accentA != lastSetsAccentA || accentB != lastSetsAccentB)

        if (!needColorUpdate && hash == lastSetsHash && visibleCount == lastSetsVisibleCount) {
            setsHeaderRow.visibility = View.VISIBLE
            setsRowA.visibility = View.VISIBLE
            setsRowB.visibility = View.VISIBLE
            return
        }

        setsHeaderRow.visibility = View.VISIBLE
        setsRowA.visibility = View.VISIBLE
        setsRowB.visibility = View.VISIBLE

        for (i in 0 until MAX_SETS) {
            val show = i < visibleCount
            setHeaderCells[i].visibility = if (show) View.VISIBLE else View.GONE
            setRowACells[i].visibility = if (show) View.VISIBLE else View.GONE
            setRowBCells[i].visibility = if (show) View.VISIBLE else View.GONE

            if (!show) continue
            val m = arr.getMap(i) ?: continue

            val idx = m.getIntOr("index", i + 1)
            val aScore = m.getIntOrNullable("a")
            val bScore = m.getIntOrNullable("b")
            val winner = m.getStringOrNull("winner")?.uppercase()
            val current = m.getBooleanOr("current", false)

            setHeaderCells[i].apply {
                text = "S$idx"
                (background as? GradientDrawable)?.let { bg ->
                    bg.cornerRadius = dp(6).toFloat()
                    bg.setStroke(
                        dp(1),
                        if (current) Color.parseColor("#94a3b8") else Color.parseColor("#cbd5e1")
                    )
                    bg.setColor(if (current) Color.parseColor("#e0f2fe") else Color.TRANSPARENT)
                }
                setTextColor(Color.parseColor("#9AA4AF"))
            }

            setRowACells[i].apply {
                text = aScore?.toString() ?: "–"
                applySetScoreStyle(this, isWin = (winner == "A"), isCurrent = current, useAccent = accentA)
            }

            setRowBCells[i].apply {
                text = bScore?.toString() ?: "–"
                applySetScoreStyle(this, isWin = (winner == "B"), isCurrent = current, useAccent = accentB)
            }
        }

        lastSetsVisibleCount = visibleCount
        lastSetsHash = hash
        lastSetsAccentA = accentA
        lastSetsAccentB = accentB
    }

    private fun computeSetsHash(arr: ReadableArray, count: Int): Int {
        var h = 1
        for (i in 0 until count) {
            val m = arr.getMap(i) ?: continue
            val idx = m.getIntOr("index", i + 1)
            val a = m.getIntOrNullable("a") ?: -1
            val b = m.getIntOrNullable("b") ?: -1
            val w = (m.getStringOrNull("winner")?.uppercase() ?: "")
            val cur = if (m.getBooleanOr("current", false)) 1 else 0
            h = 31 * h + idx
            h = 31 * h + a
            h = 31 * h + b
            h = 31 * h + w.hashCode()
            h = 31 * h + cur
        }
        return h
    }

    private fun applySetScoreStyle(cell: TextView, isWin: Boolean, isCurrent: Boolean, useAccent: Int) {
        (cell.background as? GradientDrawable)?.let { bg ->
            bg.cornerRadius = dp(6).toFloat()
            when {
                isWin -> {
                    bg.setColor(useAccent)
                    bg.setStroke(0, Color.TRANSPARENT)
                }
                isCurrent -> {
                    bg.setColor(Color.parseColor("#e5e7eb"))
                    bg.setStroke(dp(1), Color.parseColor("#94a3b8"))
                }
                else -> {
                    bg.setColor(Color.TRANSPARENT)
                    bg.setStroke(dp(1), Color.parseColor("#cbd5e1"))
                }
            }
        }
        when {
            isWin -> cell.setTextColor(Color.WHITE)
            isCurrent -> cell.setTextColor(Color.parseColor("#0b0f14"))
            else -> cell.setTextColor(Color.parseColor("#0f172a"))
        }
    }

    private fun makeSetHeaderCell(text: String, isCurrent: Boolean = false): TextView {
        return TextView(context).apply {
            this.text = text
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setTextColor(Color.parseColor("#9AA4AF"))
            gravity = Gravity.CENTER
            setPadding(dp(4), dp(4), dp(4), dp(4))
            background =
                GradientDrawable().apply {
                    cornerRadius = dp(6).toFloat()
                    setStroke(
                        dp(1),
                        if (isCurrent) Color.parseColor("#94a3b8") else Color.parseColor("#cbd5e1")
                    )
                    setColor(if (isCurrent) Color.parseColor("#e0f2fe") else Color.TRANSPARENT)
                }
            layoutParams =
                LinearLayout.LayoutParams(dp(32), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(4)
                }
        }
    }

    private fun makeSetTeamCell(text: String): TextView {
        return TextView(context).apply {
            this.text = text
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setTextColor(Color.parseColor("#9AA4AF"))
            gravity = Gravity.CENTER
            setPadding(dp(4), dp(4), dp(4), dp(4))
            layoutParams =
                LinearLayout.LayoutParams(dp(32), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(4)
                }
        }
    }

    private fun makeSetScoreCell(text: String, isWin: Boolean, isCurrent: Boolean, useAccent: Int): TextView {
        return TextView(context).apply {
            this.text = text
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            gravity = Gravity.CENTER
            layoutParams =
                LinearLayout.LayoutParams(dp(32), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(4)
                }
            background =
                GradientDrawable().apply {
                    cornerRadius = dp(6).toFloat()
                    when {
                        isWin -> {
                            setColor(useAccent)
                            setStroke(0, Color.TRANSPARENT)
                        }
                        isCurrent -> {
                            setColor(Color.parseColor("#e5e7eb"))
                            setStroke(dp(1), Color.parseColor("#94a3b8"))
                        }
                        else -> {
                            setColor(Color.TRANSPARENT)
                            setStroke(dp(1), Color.parseColor("#cbd5e1"))
                        }
                    }
                }
            when {
                isWin -> setTextColor(Color.WHITE)
                isCurrent -> setTextColor(Color.parseColor("#0b0f14"))
                else -> setTextColor(Color.parseColor("#0f172a"))
            }
        }
    }

    private fun updateClockVisibility() {
        if (showClock) {
            if (!clockRunning) {
                clockRunning = true
                tvClock.visibility = View.VISIBLE
                clockHandler.post(clockRunnable)
            }
        } else {
            clockRunning = false
            tvClock.visibility = View.GONE
            clockHandler.removeCallbacks(clockRunnable)
        }
    }

    // =============== SAFEGUARDS chống crash framework ===============
    override fun gatherTransparentRegion(region: Region?): Boolean {
        return try {
            super.gatherTransparentRegion(region)
        } catch (t: Throwable) {
            android.util.Log.e("ScoreOverlay", "⚠️ SafeGuard: gatherTransparentRegion crashed", t)
            false
        }
    }

    override fun draw(canvas: Canvas) {
        try {
            super.draw(canvas)
        } catch (t: Throwable) {
            android.util.Log.e("ScoreOverlay", "⚠️ SafeGuard: draw crashed", t)
        }
    }

    override fun dispatchDraw(canvas: Canvas) {
        try {
            super.dispatchDraw(canvas)
        } catch (t: Throwable) {
            android.util.Log.e("ScoreOverlay", "⚠️ SafeGuard: dispatchDraw crashed", t)
        }
    }

    override fun hasOverlappingRendering(): Boolean = false

    // =============== Utils ===============
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

    private fun makeCardBackground(): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = roundedPx
            setColor(if (theme == "light") 0xCCFFFFFF.toInt() else 0xCC0B0F14.toInt())
        }
    }

    private fun roundedBadgeBg(color: Int): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(999).toFloat()
            setColor(color)
        }
    }

    private fun parseColorSafe(raw: String?, fallback: Int): Int {
        return try {
            if (raw.isNullOrBlank()) fallback else Color.parseColor(raw)
        } catch (_: Throwable) {
            fallback
        }
    }

    // =============== Load ảnh an toàn ===============
    private fun ImageView.loadUrlSafe(url: String?) {
        val oldUrl = this.tag as? String
        if (oldUrl == url) {
            if (visibility != View.VISIBLE) visibility = View.VISIBLE
            return
        }
        if (url.isNullOrBlank()) {
            this.tag = null
            setImageBitmap(null)
            visibility = View.GONE
            return
        }

        visibility = View.VISIBLE
        this.tag = url

        val targetRef = java.lang.ref.WeakReference(this)
        val expectedUrl = url

        val reqWidth = if (this.width > 0) this.width else dp(80)
        val reqHeight = if (this.height > 0) this.height else dp(80)

        imageLoadExecutor.execute {
            try {
                val conn = URL(expectedUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.instanceFollowRedirects = true
                conn.connect()
                if (conn.responseCode != 200) {
                    conn.disconnect()
                    return@execute
                }

                val inputStream = java.io.BufferedInputStream(conn.inputStream)
                val byteArray = readStreamToBytesSafe(inputStream, 2 * 1024 * 1024)
                inputStream.close()
                conn.disconnect()
                if (byteArray == null) return@execute

                val bmp = decodeSampledBitmapFromByteArray(byteArray, reqWidth, reqHeight)
                val v = targetRef.get() ?: run {
                    bmp?.recycle()
                    return@execute
                }

                v.post {
                    val finalView = targetRef.get()
                    if (
                        finalView != null &&
                        finalView.isAttachedToWindow &&
                        isAttachedSafe &&
                        (finalView.tag as? String) == expectedUrl &&
                        bmp != null
                    ) {
                        finalView.setImageBitmap(bmp)
                        finalView.visibility = View.VISIBLE
                    } else {
                        bmp?.recycle()
                    }
                }
            } catch (_: Throwable) {
                // ignore
            }
        }
    }

    private fun readStreamToBytesSafe(input: InputStream, maxBytes: Int): ByteArray? {
        return try {
            val buffer = ByteArrayOutputStream()
            val data = ByteArray(4096)
            var nRead: Int
            var totalRead = 0
            while (input.read(data, 0, data.size).also { nRead = it } != -1) {
                totalRead += nRead
                if (totalRead > maxBytes) return null
                buffer.write(data, 0, nRead)
            }
            buffer.toByteArray()
        } catch (_: Exception) {
            null
        }
    }

    private fun decodeSampledBitmapFromByteArray(data: ByteArray, reqWidth: Int, reqHeight: Int): android.graphics.Bitmap? {
        return try {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, options)

            var inSampleSize = 1
            if (options.outHeight > reqHeight || options.outWidth > reqWidth) {
                val halfHeight: Int = options.outHeight / 2
                val halfWidth: Int = options.outWidth / 2
                while (
                    (halfHeight / inSampleSize) >= reqHeight &&
                    (halfWidth / inSampleSize) >= reqWidth
                ) {
                    inSampleSize *= 2
                }
            }

            options.inSampleSize = inSampleSize
            options.inJustDecodeBounds = false
            options.inPreferredConfig = android.graphics.Bitmap.Config.RGB_565
            BitmapFactory.decodeByteArray(data, 0, data.size, options)
        } catch (_: Throwable) {
            null
        }
    }

    // ReadableMap helpers
    private fun ReadableMap.getStringOrNull(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    private fun ReadableMap.getBooleanOr(key: String, def: Boolean): Boolean =
        if (hasKey(key) && !isNull(key)) getBoolean(key) else def

    private fun ReadableMap.getDoubleOr(key: String, def: Double): Double =
        if (hasKey(key) && !isNull(key)) getDouble(key) else def

    private fun ReadableMap.getIntOr(key: String, def: Int): Int =
        if (hasKey(key) && !isNull(key)) {
            try {
                getInt(key)
            } catch (_: Throwable) {
                getDouble(key).toInt()
            }
        } else def

    private fun ReadableMap.getIntOrNullable(key: String): Int? =
        if (hasKey(key) && !isNull(key)) {
            try {
                getInt(key)
            } catch (_: Throwable) {
                getDouble(key).toInt()
            }
        } else null

    private fun ReadableMap.getArrayOrNull(key: String): ReadableArray? =
        if (hasKey(key) && !isNull(key)) getArray(key) else null

    private fun ReadableArray.getStringOrNull(index: Int): String? =
        if (!isNull(index)) getString(index) else null

    fun clearCache() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            post { clearCache() }
            return
        }

        updateHandler.removeCallbacks(flushRunnable)
        flushScheduled = false
        pendingUpdateData = null

        cachedWebLogoUrl = ""
        cachedSponsorUrls = emptyList()
        cachedTournamentLogoUrl = ""
        cachedBreakLogoUrl = ""

        ivTourLogo.tag = null
        ivBreakLogo.tag = null
        ivWebLogo.tag = null
        ivDefaultV2Logo.tag = null
        sponsorSlots.forEach { it.tag = null }

        lastServeSide = null
        lastServeCount = -1
        lastServeSideV2 = null
        lastServeCountV2 = -1

        lastSetsVisibleCount = 0
        lastSetsHash = 0
    }

    /**
     * Giải phóng nhanh bitmap/drawable khi hệ thống báo thiếu RAM.
     * Lưu ý: method này sẽ xoá drawable + reset tag để lần updateState kế tiếp có thể load lại.
     */
    fun trimMemory(aggressive: Boolean = true) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            post { trimMemory(aggressive) }
            return
        }

        try {
            // Clear drawables (giải phóng bitmap trong ImageView)
            ivWebLogo.setImageDrawable(null); ivWebLogo.tag = null
            ivTourLogo.setImageDrawable(null); ivTourLogo.tag = null
            ivBreakLogo.setImageDrawable(null); ivBreakLogo.tag = null
            ivDefaultV2Logo.setImageDrawable(null); ivDefaultV2Logo.tag = null

            sponsorSlots.forEach { iv ->
                iv.setImageDrawable(null)
                iv.tag = null
            }

            if (aggressive) {
                cachedWebLogoUrl = ""
                cachedTournamentLogoUrl = ""
                cachedBreakLogoUrl = ""
                cachedSponsorUrls = emptyList()
            }
        } catch (_: Throwable) {
            // ignore
        }
    }

}
