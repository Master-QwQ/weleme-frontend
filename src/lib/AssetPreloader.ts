/**
 * Frontend Asset Preloader
 * Fetches static assets in the background to utilize browser cache.
 */

// Hardcoded list of assets to preload from /public/
const ASSETS_TO_PRELOAD = [
  "avatar.jpg",
  "favicon.ico",
  "file.svg",
  "globe.svg",
  "icons.svg",
  "next.svg",
  "robots.txt",
  "vercel.svg",
  "window.svg",
  "asset/card_example.jpg",
  "asset/exit.svg",
  "asset/loading.gif",
  "asset/loading.mp3",
  "asset/qq_group_qr.png",
  "asset/qu_lai.jpg",
  "asset/avatars/Avatar_activity_AC.png",
  "asset/avatars/Avatar_activity_AC_1.png",
  "asset/avatars/Avatar_activity_AC_2.png",
  "asset/avatars/Avatar_activity_AF.png",
  "asset/avatars/Avatar_activity_ARC1.png",
  "asset/avatars/Avatar_activity_AW.png",
  "asset/avatars/Avatar_activity_BH.png",
  "asset/avatars/Avatar_activity_BI.png",
  "asset/avatars/Avatar_activity_BN.png",
  "asset/avatars/Avatar_activity_CB.png",
  "asset/avatars/Avatar_activity_CR.png",
  "asset/avatars/Avatar_activity_CV.png",
  "asset/avatars/Avatar_activity_CW.png",
  "asset/avatars/Avatar_activity_DC.png",
  "asset/avatars/Avatar_activity_DH.png",
  "asset/avatars/Avatar_activity_DT.png",
  "asset/avatars/Avatar_activity_DV.png",
  "asset/avatars/Avatar_activity_ED2.png",
  "asset/avatars/Avatar_activity_ED_1.png",
  "asset/avatars/Avatar_activity_EP10_1.png",
  "asset/avatars/Avatar_activity_EP10_2.png",
  "asset/avatars/Avatar_activity_EP11.png",
  "asset/avatars/Avatar_activity_EP12.png",
  "asset/avatars/Avatar_activity_EP13.png",
  "asset/avatars/Avatar_activity_EP14.png",
  "asset/avatars/Avatar_activity_FA.png",
  "asset/avatars/Avatar_activity_FC.png",
  "asset/avatars/Avatar_activity_FD.png",
  "asset/avatars/Avatar_activity_GA.png",
  "asset/avatars/Avatar_activity_GK.png",
  "asset/avatars/Avatar_activity_HE.png",
  "asset/avatars/Avatar_activity_HLL.png",
  "asset/avatars/Avatar_activity_HS.png",
  "asset/avatars/Avatar_activity_IC.png",
  "asset/avatars/Avatar_activity_IS.png",
  "asset/avatars/Avatar_activity_IW.png",
  "asset/avatars/Avatar_activity_KR.png",
  "asset/avatars/Avatar_activity_LE.png",
  "asset/avatars/Avatar_activity_MB.png",
  "asset/avatars/Avatar_activity_MN.png",
  "asset/avatars/Avatar_activity_MULTI2.png",
  "asset/avatars/Avatar_activity_NL.png",
  "asset/avatars/Avatar_activity_OF.png",
  "asset/avatars/Avatar_activity_OI.png",
  "asset/avatars/Avatar_activity_PL.png",
  "asset/avatars/Avatar_activity_PS.png",
  "asset/avatars/Avatar_activity_RI.png",
  "asset/avatars/Avatar_activity_RL1_1.png",
  "asset/avatars/Avatar_activity_RL1_2.png",
  "asset/avatars/Avatar_activity_RL2_1.png",
  "asset/avatars/Avatar_activity_RL2_2.png",
  "asset/avatars/Avatar_activity_RL3_1.png",
  "asset/avatars/Avatar_activity_RL3_2.png",
  "asset/avatars/Avatar_activity_RL4_1.png",
  "asset/avatars/Avatar_activity_RL4_2.png",
  "asset/avatars/Avatar_activity_RL4_3.png",
  "asset/avatars/Avatar_activity_RL5_1.png",
  "asset/avatars/Avatar_activity_RL5_2.png",
  "asset/avatars/Avatar_activity_RS.png",
  "asset/avatars/Avatar_activity_SA.png",
  "asset/avatars/Avatar_activity_SL.png",
  "asset/avatars/Avatar_activity_SN.png",
  "asset/avatars/Avatar_activity_SV.png",
  "asset/avatars/Avatar_activity_TB.png",
  "asset/avatars/Avatar_activity_TC.png",
  "asset/avatars/Avatar_activity_TG.png",
  "asset/avatars/Avatar_activity_TW.png",
  "asset/avatars/Avatar_activity_UT.png",
  "asset/avatars/Avatar_activity_VEC1.png",
  "asset/avatars/Avatar_activity_VI.png",
  "asset/avatars/Avatar_activity_WB.png",
  "asset/avatars/Avatar_activity_WD.png",
  "asset/avatars/Avatar_activity_WR.png",
  "asset/avatars/Avatar_activity_XB1_1.png",
  "asset/avatars/Avatar_activity_XB1_2.png",
  "asset/avatars/Avatar_activity_ZT.png",
  "asset/avatars/Avatar_activity_mujica.png",
  "asset/avatars/Avatar_activity_pcAct.png",
  "asset/avatars/Avatar_def_01.png",
  "asset/avatars/Avatar_def_02.png",
  "asset/avatars/Avatar_def_03.png",
  "asset/avatars/Avatar_def_04.png",
  "asset/avatars/Avatar_def_05.png",
  "asset/avatars/Avatar_def_06.png",
  "asset/avatars/Avatar_def_07.png",
  "asset/avatars/Avatar_def_08.png",
  "asset/avatars/Avatar_def_09.png",
  "asset/avatars/Avatar_def_10.png",
  "asset/avatars/Avatar_def_11.png",
  "asset/avatars/Avatar_def_12.png",
  "asset/avatars/Avatar_def_13.png",
  "asset/avatars/Avatar_def_14.png",
  "asset/avatars/Avatar_def_15.png",
  "asset/avatars/Avatar_dyn_01.png",
  "asset/avatars/Avatar_dyn_02.png",
  "asset/avatars/Avatar_dyn_03.png",
  "asset/avatars/Avatar_dyn_04.png",
  "asset/avatars/Avatar_special_01.png",
  "asset/avatars/Avatar_special_02.png",
  "asset/avatars/Avatar_special_03.png",
  "asset/avatars/Avatar_special_04.png",
  "asset/avatars/Avatar_special_05.png",
  "asset/avatars/Avatar_special_06.png",
  "asset/avatars/Avatar_special_07.png",
  "asset/avatars/Avatar_special_08.png",
  "asset/avatars/Avatar_special_09.png",
  "asset/avatars/Avatar_special_10.png",
  "asset/avatars/Avatar_special_11.png",
  "asset/avatars/Avatar_special_12.png",
  "asset/avatars/Avatar_special_13.png",
  "asset/avatars/Avatar_special_14.png",
  "asset/avatars/Avatar_special_15.png",
  "asset/avatars/Avatar_special_16.png",
  "asset/avatars/Avatar_special_17.png",
  "asset/avatars/Avatar_special_18.png",
  "asset/avatars/Avatar_special_19.png",
  "asset/avatars/Avatar_special_20.png",
  "asset/avatars/Avatar_special_21.png",
  "asset/avatars/Avatar_special_22.png",
  "asset/avatars/Avatar_special_23.png",
  "asset/avatars/Avatar_special_24.png",
  "asset/avatars/Avatar_special_25.png",
  "asset/avatars/Avatar_special_26.png",
  "asset/avatars/Avatar_special_27.png",
  "asset/avatars/Avatar_special_28.png",
  "asset/avatars/Avatar_special_29.png",
  "asset/avatars/Avatar_special_30.png",
  "asset/avatars/Avatar_special_31.png",
  "asset/avatars/Avatar_special_32.png",
  "asset/avatars/Avatar_special_33.png",
  "asset/avatars/Avatar_special_34.png",
  "asset/avatars/Avatar_special_35.png",
  "asset/avatars/Avatar_special_36.png",
  "asset/avatars/Avatar_special_37.png",
  "asset/avatars/Avatar_special_38.png",
  "asset/avatars/Avatar_special_39.png",
  "asset/avatars/Avatar_special_40.png",
  "asset/avatars/Avatar_special_41.png",
  "asset/avatars/Avatar_special_42.png",
  "asset/avatars/Avatar_special_43.png",
  "asset/avatars/Avatar_special_44.png",
  "asset/avatars/Avatar_special_45.png",
  "asset/avatars/Avatar_special_46.png",
  "asset/avatars/Avatar_special_47.png",
  "asset/avatars/Avatar_special_48.png",
  "asset/avatars/Avatar_special_49.png",
  "asset/avatars/Avatar_special_50.png",
  "asset/avatars/Avatar_special_51.png",
  "asset/avatars/Avatar_special_52.png",
  "asset/avatars/Avatar_special_53.png",
  "asset/avatars/Avatar_special_54.png",
  "asset/avatars/Avatar_special_55.png",
  "asset/avatars/Avatar_special_56.png",
  "asset/avatars/Avatar_special_57.png",
  "asset/avatars/Avatar_special_58.png",
  "asset/avatars/Avatar_special_60.png",
  "asset/avatars/Avatar_special_61.png",
  "asset/avatars/Avatar_special_62.png",
  "asset/avatars/Avatar_special_63.png",
  "asset/avatars/Avatar_special_64.png",
  "asset/avatars/Avatar_special_65.png",
  "asset/avatars/Avatar_special_76.png",
  "asset/avatars/Avatar_special_77.png",
  "asset/avatars/Avatar_special_78.png",
  "asset/avatars/Avatar_special_79.png",
  "asset/avatars/Avatar_special_80.png",
  "asset/avatars/Avatar_special_MissC.png"
];

/**
 * Preloads all assets asynchronously in the background.
 */
export async function preloadAllAssets() {
  console.log(`[Preloader] Starting preloading of ${ASSETS_TO_PRELOAD.length} assets...`);

  // Use a small delay to ensure initial page load is finished
  setTimeout(() => {
    // Process assets in small batches to avoid network congestion
    const batchSize = 5;
    const processBatch = async (startIndex: number) => {
      if (startIndex >= ASSETS_TO_PRELOAD.length) {
        console.log("[Preloader] All assets preloaded successfully.");
        return;
      }

      const batch = ASSETS_TO_PRELOAD.slice(startIndex, startIndex + batchSize);
      await Promise.allSettled(batch.map(preloadAsset));

      // Schedule next batch
      setTimeout(() => processBatch(startIndex + batchSize), 100);
    };

    processBatch(0);
  }, 10);
}

function preloadAsset(path: string): Promise<void> {
  return new Promise((resolve) => {
    const fullPath = `/${path}`;
    const ext = path.split('.').pop()?.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'ico'].includes(ext || '')) {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Resolve anyway to continue
      img.src = fullPath;
    } else if (ext === 'mp3') {
      const audio = new Audio();
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => resolve();
      audio.src = fullPath;
      audio.load();
    } else {
      // For other files, use fetch with 'low' priority if supported
      fetch(fullPath, { priority: 'low' as any } as any)
        .then(() => resolve())
        .catch(() => resolve());
    }
  });
}
