/**
 * Mega Menu & Navigation Interaction Handler
 * Portal Layanan Penerbitan Ijazah - Universitas Tanjungpura
 *
 * Mengelola interaktivitas Mega Menu:
 * - Hover and click/touch toggle untuk dropdown Mega Menu
 * - Aksesibilitas ARIA (aria-expanded, keyboard navigation)
 * - Auto-close saat klik di luar (click-outside) atau tombol Escape
 * - Pengelolaan drawer mobile responsif tanpa double-event conflict
 */

(function () {
  'use strict';

  function initMegaMenu() {
    const containers = document.querySelectorAll('.mega-menu-container');

    containers.forEach(container => {
      const btn = container.querySelector('button');
      const panel = container.querySelector('.mega-menu-panel');
      const chevron = container.querySelector('.chevron-icon');

      if (!btn || !panel) return;

      // Mouseenter: bersihkan paksaan hidden saat cursor diarahkan ke menu
      container.addEventListener('mouseenter', function () {
        panel.classList.remove('!invisible', '!opacity-0', 'pointer-events-none');
      });

      // Mouseleave: kembalikan chevron dan status aria
      container.addEventListener('mouseleave', function () {
        if (!panel.classList.contains('mega-menu-open')) {
          btn.setAttribute('aria-expanded', 'false');
          if (chevron) chevron.classList.remove('rotate-180');
        }
      });

      // Click / Touch Toggle
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = btn.getAttribute('aria-expanded') === 'true' && !panel.classList.contains('!invisible');

        // Tutup menu lain terlebih dahulu
        closeAllMegaMenus();

        if (!isOpen) {
          openMenu(btn, panel, chevron);
        } else {
          closeMenu(btn, panel, chevron);
        }
      });

      // Mencegah klik di dalam panel menutup dropdown saat berinteraksi
      panel.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    });

    // Menutup semua mega menu saat klik di luar
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.mega-menu-container')) {
        closeAllMegaMenus();
      }
    });

    // Menutup dengan tombol Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllMegaMenus();
      }
    });

    // Inisialisasi Mobile Drawer Toggle
    initMobileDrawer();
  }

  function openMenu(btn, panel, chevron) {
    btn.setAttribute('aria-expanded', 'true');
    panel.classList.remove('!invisible', '!opacity-0', 'pointer-events-none');
    panel.classList.add('mega-menu-open', '!opacity-100', '!visible', '!translate-y-0', '!pointer-events-auto');
    if (chevron) {
      chevron.classList.add('rotate-180');
    }
  }

  function closeMenu(btn, panel, chevron) {
    btn.setAttribute('aria-expanded', 'false');
    panel.classList.remove('mega-menu-open', '!opacity-100', '!visible', '!translate-y-0', '!pointer-events-auto');
    panel.classList.add('!invisible', '!opacity-0', 'pointer-events-none');
    if (chevron) {
      chevron.classList.remove('rotate-180');
    }
  }

  function closeAllMegaMenus() {
    document.querySelectorAll('.mega-menu-container').forEach(container => {
      const btn = container.querySelector('button');
      const panel = container.querySelector('.mega-menu-panel');
      const chevron = container.querySelector('.chevron-icon');
      if (btn && panel) {
        closeMenu(btn, panel, chevron);
      }
    });
  }

  function initMobileDrawer() {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const drawer = document.getElementById('mobile-menu-drawer');
    const icon = document.getElementById('menu-icon');

    if (!toggleBtn || !drawer) return;

    // Pasang handler toggle hanya pada halaman yang belum memiliki listener bawaan (seperti user/index.html)
    if (!toggleBtn.dataset.megamenuDrawerBound) {
      toggleBtn.dataset.megamenuDrawerBound = 'true';
      if (window.location.pathname.includes('/user/')) {
        toggleBtn.addEventListener('click', function () {
          drawer.classList.toggle('hidden');
          if (icon) {
            icon.textContent = drawer.classList.contains('hidden') ? 'menu' : 'close';
          }
        });
      }
    }
  }

  // Jalankan saat dokumen siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMegaMenu);
  } else {
    initMegaMenu();
  }

  // Ekspor global jika dibutuhkan
  window.UntanMegaMenu = {
    init: initMegaMenu,
    open: openMenu,
    close: closeMenu,
    closeAll: closeAllMegaMenus
  };
})();
