const currentPath = window.location.pathname;
// 配置哪些页面不显示页脚
const hideFooterPages = ['/login/', '/register/', '/profile/'];

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
<header id="main-header" class="fixed top-0 z-50 w-full h-14 bg-[#252525] flex items-center transition-all duration-300">
    <div class="px-5 w-full flex items-center justify-between h-full">
        <a href="/" class="flex items-center">
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
            <div class="h-px bg-white/10 my-1 mx-2"></div>
            <a href="/wiki/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">WIKI</a>
            <a href="/creation/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">创作</a>
            <a href="/forum/" class="block px-4 py-2 text-sm font-medium rounded-lg text-[#f5d78d] hover:bg-white/10 transition-colors">贴吧</a>
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

document.body.insertAdjacentHTML('afterbegin', loadingHTML);
document.body.insertAdjacentHTML('afterbegin', navHTML);

if (!hideFooterPages.some(path => currentPath.includes(path))) {
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

function initLayout() {
    // 1. 页面加载完毕后读取闪存消息 (Flash Message)
    window.addEventListener('load', () => {
        const loader = document.getElementById('loading-screen');
        if (loader) {
            loader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => loader.remove(), 500);
        }
        
        // 延迟半秒弹出提示，避免和加载动画冲突
        setTimeout(() => {
            const msg = sessionStorage.getItem('flash_message');
            if (msg && typeof showToast !== 'undefined') {
                showToast(msg, 'success');
                sessionStorage.removeItem('flash_message');
            }
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
        if (window.scrollY > 50) {
            header.classList.add('header-scrolled');
            closeMenu();
        } else {
            header.classList.remove('header-scrolled');
        }
    });

    function closeMenu() {
        dropdownMenu.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
        dropdownMenu.classList.add('opacity-0', 'pointer-events-none', 'scale-95', 'translate-y-[-10px]');
    }

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        const isOpen = dropdownMenu.classList.contains('opacity-100');
        if (isOpen) {
            closeMenu();
        } else {
            dropdownMenu.classList.add('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
            dropdownMenu.classList.remove('opacity-0', 'pointer-events-none', 'scale-95', 'translate-y-[-10px]');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target) && !menuBtn.contains(e.target)) {
            closeMenu();
        }
    });

    function updateThemeIcons() {
        if (document.documentElement.classList.contains('dark')) {
            iconSun.classList.remove('hidden');
            iconMoon.classList.add('hidden');
        } else {
            iconSun.classList.add('hidden');
            iconMoon.classList.remove('hidden');
        }
    }
    updateThemeIcons();

    themeToggleBtn.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
        } else {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
        }
        updateThemeIcons();
    });

    // 2. 登录状态检测与侧边栏按钮切换
    if (typeof API !== 'undefined') {
        API.getMe().then(data => {
            if (data && data.user) {
                if (loginBtn) {
                    loginBtn.textContent = `欢迎, ${data.user.name}`;
                    loginBtn.href = "/profile/"; 
                }
                if (logoutBtn) {
                    logoutBtn.classList.remove('hidden');
                }
            }
        }).catch(console.log);
    }

    // 3. 退出登录绑定
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await API.logout();
                window.location.href = '/login/'; // 退出后直接跳转
            } catch (error) {
                if (typeof showToast !== 'undefined') showToast("退出失败，请重试", "error");
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
} else {
    initLayout();
}