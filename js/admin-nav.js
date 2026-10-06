/* =========================================================
   檔案：js/admin-nav.js
   管理員打開社員也會用的頁面（排行榜、圖鑑、回憶牆、年度回顧）時，
   把導覽列換成後台的版本
   ========================================================= */

const ADMIN_LINKS = [
  ["./admin.html", "管理首頁"],
  ["./admin-announcements.html", "公告管理"],
  ["./admin-courses.html", "社課管理"],
  ["./admin-members.html", "社員管理"],
  ["./admin-trips.html", "出團紀錄"],
  ["./leaderboard.html", "排行榜"],
  ["./admin-settle.html", "排行榜管理"]
];

export function applyAdminNav() {
  const nav =
    document.querySelector(".site-nav");

  if (!nav) {
    return;
  }

  const currentPage =
    window.location.pathname.split("/").pop() || "index.html";

  /*
   * 保留登出按鈕，只換掉連結
   */
  nav
    .querySelectorAll("a")
    .forEach((link) => link.remove());

  const logoutButton =
    nav.querySelector("button");

  ADMIN_LINKS.forEach(([href, label]) => {
    const link =
      document.createElement("a");

    link.href = href;
    link.textContent = label;

    if (href.endsWith(currentPage)) {
      link.classList.add("active");
    }

    nav.insertBefore(link, logoutButton);
  });

  const brand =
    document.querySelector(".site-brand");

  if (brand) {
    brand.href = "./admin.html";

    const subtitle =
      brand.querySelector("small");

    if (subtitle) {
      subtitle.textContent = "管理員後台";
    }
  }
}
