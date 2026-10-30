const currentPath = window.location.pathname;
const hideFooterPages = ['/login/', '/register/', '/profile/', '/admin/', '/forum/', '/wiki/'];
const drawerPages = ['/forum/', '/wiki/'];
const isDrawerPage = drawerPages.some(p => currentPath.includes(p));
const isForumPage = currentPath.includes('/forum/');
const isWikiPage = currentPath.includes('/wiki/');

const loadingHTML = `
<div id="loading-screen" class="fixed inset-0 z-[9999] bg-[#252525] flex items-center justify-center transition-opacity duration-500">
    <div class="dot-grid">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>
</div>
`;

const navHTML = `
<header id="main-header" class="fixed top-0 z-[999] w-full h-14 bg-[#252525] flex items-center">
    <div class="px-5 w-full flex items-center justify-between h-full">
        <a href="/" id="nav-logo-btn" class="flex items-center">
            <span class="logo-text text-xl font-black tracking-tighter pt-1">CEC</span>
        </a>
        <div class="flex items-center gap-2">
            <button id="theme-toggle" class="text-[#f5d78d] p-2 hover:opacity-70 transition-opacity flex items-center justify-center interactive-btn">
                <svg id="icon-sun" class="w-6 h-6 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                <svg id="icon-moon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            </button>
            <button id="menu-btn" class="text-[#f5d78d] p-2 hover:opacity-70 transition-opacity flex items-center justify-center interactive-btn">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
            </button>
        </div>
    </div>
    <div id="dropdown-menu" class="absolute top-[60px] right-4 w-44 rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-50 opacity-0 pointer-events-none transition-all duration-300 scale-95 translate-y-[-10px]">
        <div class="absolute inset-0 bg-[#1f1f1f]/95 backdrop-blur-xl z-[-1]"></div>
        <div class="flex flex-col py-3 px-2 gap-1 font-sans">
            <a href="/login/index.html" id="nav-login-btn" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">登录</a>
            <a href="#" id="nav-logout-btn" class="hidden px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">退出登录</a>
            <a href="/admin/" id="nav-admin-btn" class="hidden px-4 py-2 text-sm font-bold rounded-lg text-black bg-gradient-to-r from-[#e8c88c] to-[#c89f5d] hover:opacity-90 transition-colors">管理中枢</a>
            <div class="h-px bg-white/10 my-1 mx-2"></div>
            <a href="/wiki/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">Wiki</a>
            <a href="/forum/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">发现</a>
            <a href="/about/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">关于</a>
            <a href="/join/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">加入我们</a>
        </div>
    </div>
</header>
`;

const footerHTML = `
<footer class="bg-[#181818] py-8 border-t border-white/5 z-10 relative mt-auto">
    <div class="px-5 flex flex-col items-center gap-5">
        <div class="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium tracking-widest font-roman">
            <a href="/join/" class="text-[#f5d78d] no-underline hover:opacity-70 transition-opacity">Join us</a>
            <a href="/privacy/" class="text-[#f5d78d] no-underline hover:opacity-70 transition-opacity">Privacy</a>
            <a href="/wiki/" class="text-[#f5d78d] no-underline hover:opacity-70 transition-opacity">Wiki</a>
            <a href="/about/" class="text-[#f5d78d] no-underline hover:opacity-70 transition-opacity">About</a>
        </div>
        <div class="text-[11px] text-[#c89f5d] tracking-wide mt-2 font-roman text-center">
            © 2026 Reozar Lab. CC-BY-SA 4.0
        </div>
    </div>
</footer>
`;

const sideDrawerHTML = `
<div id="side-drawer-overlay" class="fixed inset-0 bg-black/40 z-[1000] backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300"></div>
<aside id="side-drawer" class="fixed top-0 bottom-0 right-0 w-64 ios-card z-[1001] shadow-2xl flex flex-col border-l ios-border overflow-hidden translate-x-full transition-transform duration-300">
    <div class="p-4 border-b ios-border">
        <div class="flex items-center justify-between mb-3">
            <div class="cec-avatar w-12 h-12 text-xl shadow-sm" id="side-drawer-avatar">?</div>
            <button id="side-drawer-close" class="ios-text opacity-40 hover:opacity-100 transition p-1.5 bg-black/5 dark:bg-white/5 rounded-full">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <h2 class="text-base font-bold cec-text-dark w-full truncate" id="side-drawer-name">加载中...</h2>
        <p class="text-xs ios-text opacity-50 mt-1 w-full truncate" id="side-drawer-email">---</p>
        <div class="flex gap-4 mt-3 text-sm">
            <div class="flex flex-col"><span class="font-bold cec-text-dark" id="side-drawer-following">0</span><span class="text-xs ios-text opacity-50">关注</span></div>
            <div class="flex flex-col"><span class="font-bold cec-text-dark" id="side-drawer-followers">0</span><span class="text-xs ios-text opacity-50">追随者</span></div>
        </div>
    </div>
    <div class="flex-1 overflow-y-auto p-3 space-y-1">
        <a href="/profile/index.html" class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">
            <svg class="w-5 h-5 ios-text opacity-40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span class="ios-text font-medium text-sm truncate">个人中心</span>
        </a>
        
        <a href="/wiki/edit/" id="side-drawer-edit-link" class="hidden items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">
            <svg class="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            <span class="ios-text font-medium text-sm truncate">编辑百科</span>
        </a>

        <a href="/admin/" id="side-drawer-admin-link" class="hidden items-center gap-3 p-2.5 rounded-xl bg-[#f5d78d]/10 hover:bg-[#f5d78d]/20 transition">
            <svg class="w-5 h-5 text-[#c89f5d] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span class="text-[#c89f5d] font-bold text-sm truncate">管理中枢</span>
        </a>

        <div class="h-px bg-black/5 dark:bg-white/10 my-2 mx-1"></div>

        <a href="/forum/index.html" class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">
            <svg class="w-5 h-5 ios-text opacity-40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span class="ios-text font-medium text-sm truncate">发现</span>
        </a>
        <a href="/wiki/index.html" class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">
            <svg class="w-5 h-5 ios-text opacity-40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            <span class="ios-text font-medium text-sm truncate">Wiki</span>
        </a>
    </div>
</aside>
`;

document.body.insertAdjacentHTML('afterbegin', loadingHTML);
document.body.insertAdjacentHTML('afterbegin', navHTML);

if (isDrawerPage) {
    document.body.insertAdjacentHTML('beforeend', sideDrawerHTML);
}

if (!hideFooterPages.some(path => currentPath.includes(path))) {
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

function initLayout() {
    window.addEventListener('load', () => {
        const loader = document.getElementById('loading-screen');
        if (loader) { loader.classList.add('opacity-0', 'pointer-events-none'); setTimeout(() => loader.remove(), 500); }
        setTimeout(() => {
            const msg = sessionStorage.getItem('flash_message');
            if (msg && typeof showToast !== 'undefined') { showToast(msg, 'success'); sessionStorage.removeItem('flash_message'); }
        }, 600);
    });

    const header = document.getElementById('main-header');
    const menuBtn = document.getElementById('menu-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const iconSun = document.getElementById('icon-sun');
    const iconMoon = document.getElementById('icon-moon');
    const loginBtn = document.getElementById('nav-login-btn');
    const logoutBtn = document.getElementById('nav-logout-btn');

    window.addEventListener('scroll', () => {
        if (isWikiPage) return; 
        if (window.scrollY > 50) { header.classList.add('header-scrolled'); closeMenu(); }
        else header.classList.remove('header-scrolled');
    });

    window.addEventListener('message', (event) => {
        const data = event.data;
        
        if (data && data.type === 'wiki_scroll') {
            const scrollY = data.scrollY;
            if (scrollY >= 56) header.style.transform = `translateY(-56px)`;
            else header.style.transform = `translateY(-${scrollY}px)`;
        } else if (data === 'open_main_menu') {
            toggleSideDrawer();
        } else if (data && data.type === 'wiki_darkmode') {
            const isDark = data.isDark;
            if (isDark) {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.theme = 'light';
            }
            updateThemeIcons();
        }
    });

    function closeMenu() {
        dropdownMenu.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
        dropdownMenu.classList.add('opacity-0', 'pointer-events-none', 'scale-95', 'translate-y-[-10px]');
    }

    function openMenu() {
        dropdownMenu.classList.add('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
        dropdownMenu.classList.remove('opacity-0', 'pointer-events-none', 'scale-95', 'translate-y-[-10px]');
    }

    const sideDrawer = document.getElementById('side-drawer');
    const sideDrawerOverlay = document.getElementById('side-drawer-overlay');

    function openSideDrawer() {
        if (!sideDrawer) return;
        sideDrawer.classList.remove('translate-x-full');
        sideDrawer.classList.add('translate-x-0');
        sideDrawerOverlay.classList.remove('opacity-0', 'pointer-events-none');
        sideDrawerOverlay.classList.add('opacity-100', 'pointer-events-auto');
        closeMenu();
    }

    function closeSideDrawer() {
        if (!sideDrawer) return;
        sideDrawer.classList.add('translate-x-full');
        sideDrawer.classList.remove('translate-x-0');
        sideDrawerOverlay.classList.add('opacity-0', 'pointer-events-none');
        sideDrawerOverlay.classList.remove('opacity-100', 'pointer-events-auto');
    }

    function toggleSideDrawer() {
        if (!sideDrawer) return;
        if (sideDrawer.classList.contains('translate-x-full')) openSideDrawer();
        else closeSideDrawer();
    }

    window.toggleSideDrawer = toggleSideDrawer;

    if (sideDrawer) {
        const closeBtn = document.getElementById('side-drawer-close');
        if (closeBtn) closeBtn.addEventListener('click', closeSideDrawer);
        sideDrawerOverlay.addEventListener('click', closeSideDrawer);

        if (isForumPage) {
            const footer = document.getElementById('side-drawer-footer');
            if (footer) footer.classList.remove('hidden');
            const publishBtn = document.getElementById('side-drawer-publish-btn');
            if (publishBtn) {
                publishBtn.addEventListener('click', () => {
                    closeSideDrawer();
                    document.dispatchEvent(new CustomEvent('open-publish'));
                });
            }
        }
    }

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDrawerPage) {
            toggleSideDrawer();
        } else {
            if (dropdownMenu.classList.contains('opacity-100')) closeMenu();
            else openMenu();
        }
    });

    document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    });

    function updateThemeIcons() {
        if (document.documentElement.classList.contains('dark')) { iconSun.classList.remove('hidden'); iconMoon.classList.add('hidden'); }
        else { iconSun.classList.add('hidden'); iconMoon.classList.remove('hidden'); }
    }
    updateThemeIcons();

    themeToggleBtn.addEventListener('click', () => {
        let isDark = false;
        if (document.documentElement.classList.contains('dark')) { 
            document.documentElement.classList.remove('dark'); localStorage.theme = 'light'; 
        } else { 
            document.documentElement.classList.add('dark'); localStorage.theme = 'dark'; isDark = true;
        }
        updateThemeIcons();
        
        const iframe = document.getElementById('wiki-frame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'main_darkmode', isDark: isDark }, '*');
        }
    });

    if (typeof API !== 'undefined') {
        API.getMe().then(data => {
            if (data && data.user) {
                const user = data.user;
                if (loginBtn) { loginBtn.textContent = `欢迎, ${user.name}`; loginBtn.href = "/profile/"; }
                if (logoutBtn) logoutBtn.classList.remove('hidden');
                if (user.role === 'root' || user.role === 'admin') {
                    const adminBtn = document.getElementById('nav-admin-btn'); if (adminBtn) adminBtn.classList.remove('hidden');
                    const sdAdmin = document.getElementById('side-drawer-admin-link'); if (sdAdmin) { sdAdmin.classList.remove('hidden'); sdAdmin.classList.add('flex'); }
                }
                if (user.role === 'editor' || user.role === 'admin' || user.role === 'root') {
                    const editLink = document.getElementById('side-drawer-edit-link'); if (editLink) { editLink.classList.remove('hidden'); editLink.classList.add('flex'); }
                }
                const sdName = document.getElementById('side-drawer-name'); const sdEmail = document.getElementById('side-drawer-email'); const sdAvatar = document.getElementById('side-drawer-avatar');
                if (sdName) sdName.textContent = user.name; if (sdEmail) sdEmail.textContent = user.email; if (sdAvatar) sdAvatar.textContent = user.name.charAt(0).toUpperCase();
            } else {
                const sdName = document.getElementById('side-drawer-name'); const sdEmail = document.getElementById('side-drawer-email');
                if (sdName) sdName.textContent = '访客'; if (sdEmail) sdEmail.textContent = '未登录';
            }
        }).catch(console.log);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try { await API.logout(); window.location.href = '/login/'; } catch (error) { if (typeof showToast !== 'undefined') showToast("退出失败", "error"); }
        });
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLayout);
else initLayout();