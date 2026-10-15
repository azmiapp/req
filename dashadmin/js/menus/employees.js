/* Menu module: employees
 * Markup is isolated in pages/employees.html.
 * Cross-menu state and shared API functions remain in ../app.js to preserve
 * the original application behavior and avoid duplicate global declarations.
 */
window.DashboardMenuModules = window.DashboardMenuModules || {};
window.DashboardMenuModules["employees"] = {
  pageId: "page-employees",
  ready: true
};
