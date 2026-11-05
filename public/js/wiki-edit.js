document.addEventListener('DOMContentLoaded', () => {
    let isSaved = true;
    let currentUserRole = 'user';
    let allWikiFiles = []; 

    const categorySelect = document.getElementById('category-select');
    const pageNameInput = document.getElementById('page-name');
    const pathPreview = document.getElementById('full-path-preview');
    const contentInput = document.getElementById('md-content');
    const saveBtn = document.getElementById('save-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');
    const newCategoryBtn = document.getElementById('new-category-btn');
    const datalist = document.getElementById('all-wiki-files');

    const resetModal = document.getElementById('reset-modal');
    const resetPanel = document.getElementById('reset-panel');
    const newCategoryInput = document.getElementById('new-category-input');
    const modalConfirm = document.getElementById('modal-confirm');

    // 离开页面拦截
    window.addEventListener('beforeunload', (e) => {
        if (!isSaved) {
            e.preventDefault();
            e.returnValue = '您有未保存的修改，确定要离开吗？';
        }
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && !isSaved) {
            if (link.href.includes('/wiki/edit/')) return;
            if (!confirm('您有未保存的修改，确定要离开吗？')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);

    contentInput.addEventListener('input', () => { isSaved = false; });

    function parseAndSyncInput() {
        let name = pageNameInput.value.trim();
        let cat = categorySelect.value;

        if (name.includes('/')) {
            const parts = name.split('/');
            name = parts.pop(); 
            cat = parts.join('/'); 
            
            pageNameInput.value = name; 
            
            const option = Array.from(categorySelect.options).find(o => o.value === cat);
            if (option) {
                categorySelect.value = cat;
            } else {
                categorySelect.add(new Option(cat, cat, true, true));
                categorySelect.value = cat;
            }
        }
        updatePreview();
    }

    function getFinalPath() {
        let cat = categorySelect.value;
        let name = pageNameInput.value.trim();
        
        name = name.replace(/^\/+|\/+$/g, '');
        if (!name) return '';

        if (cat && !name.startsWith(cat + '/')) {
            return `${cat}/${name}.md`;
        }
        return name.endsWith('.md') ? name : `${name}.md`;
    }

    function updatePreview() {
        const fullPath = getFinalPath();
        pathPreview.textContent = fullPath ? `当前路径: content/${fullPath}` : "当前路径: 请输入词条名";
    }

    pageNameInput.addEventListener('input', () => { 
        isSaved = false; 
        updatePreview(); 
    });
    categorySelect.addEventListener('change', () => { 
        isSaved = false; 
        updatePreview(); 
    });

    async function init() {
        if (typeof API !== 'undefined') {
            try {
                const data = await API.getMe();
                if (!data || !data.user || !['editor', 'admin', 'root'].includes(data.user.role)) {
                    alert('权限不足');
                    window.location.href = '/wiki/';
                    return;
                }
                currentUserRole = data.user.role;
                if (currentUserRole === 'admin' || currentUserRole === 'root') {
                    newCategoryBtn.classList.remove('hidden');
                }
            } catch (e) { window.location.href = '/login/'; return; }
        }

        await loadCategories();
        await loadAllFiles(); 

        let currentPath = sessionStorage.getItem('current_wiki_path');
        if (currentPath) {
            currentPath = decodeURIComponent(currentPath);
            const parts = currentPath.split('/');
            
            if (parts.length > 1) {
                const category = parts[0];
                const name = parts[parts.length - 1].replace('.md', '');
                
                const option = Array.from(categorySelect.options).find(o => o.value === category);
                if (option) {
                    categorySelect.value = category;
                } else {
                    categorySelect.value = category;
                    categorySelect.add(new Option(category, category, true, true));
                }
                pageNameInput.value = name;
            } else {
                categorySelect.value = ""; 
                pageNameInput.value = currentPath.replace('.md', '');
            }
            updatePreview();
            await loadContent();
            isSaved = true; 
        }
    }

    async function loadCategories() {
        try {
            const res = await fetch('/api/wiki/categories');
            const data = await res.json();
            if (data.categories) {
                data.categories.sort().forEach(cat => {
                    categorySelect.add(new Option(cat, cat));
                });
            }
        } catch (e) { console.error('拉取分类失败', e); }
    }

    async function loadAllFiles() {
        try {
            const res = await fetch('/api/wiki/all-files');
            const data = await res.json();
            if (data.files) {
                allWikiFiles = data.files;
                datalist.innerHTML = '';
                allWikiFiles.forEach(path => {
                    const option = document.createElement('option');
                    option.value = path; 
                    datalist.appendChild(option);
                });
            }
        } catch (e) { console.error('加载全局列表失败', e); }
    }

    async function loadContent() {
        const path = getFinalPath();
        if (!path) return;

        contentInput.placeholder = "正在从 GitHub 拉取内容...";
        try {
            const res = await fetch(`/api/wiki/get?path=${encodeURIComponent(path)}`);
            if (res.ok) {
                const data = await res.json();
                contentInput.value = data.content || '';
            } else if (res.status === 404) {
                contentInput.value = ''; 
                showToast('新词条，已清空内容', 'info');
            } else {
                const errData = await res.json();
                alert(`拉取失败 (${res.status}):\n${errData.error}`);
                contentInput.value = ''; 
            }
        } catch (err) {
            alert(`网络错误: ${err.message}`);
        } finally {
            contentInput.placeholder = "在这里输入 Markdown 内容...";
        }
    }

    pageNameInput.addEventListener('change', () => {
        parseAndSyncInput(); 
        if (pageNameInput.value.trim()) {
            loadContent();
        }
    });

    categorySelect.addEventListener('change', () => {
        if (pageNameInput.value.trim()) {
            loadContent();
        }
    });

    // 新建分类弹窗
    newCategoryBtn.addEventListener('click', () => {
        newCategoryInput.value = '';
        resetModal.classList.remove('hidden');
        setTimeout(() => {
            resetModal.classList.remove('opacity-0');
            resetPanel.classList.remove('translate-y-full', 'sm:scale-95');
        }, 10);
    });

    window.closeResetModal = function() {
        resetModal.classList.add('opacity-0');
        resetPanel.classList.add('translate-y-full', 'sm:scale-95');
        setTimeout(() => resetModal.classList.add('hidden'), 300);
    }

    resetModal.addEventListener('click', (e) => { if (e.target === resetModal) window.closeResetModal(); });

    modalConfirm.addEventListener('click', async () => {
        const newCat = newCategoryInput.value.trim();
        if (!newCat) return showToast('分类名不能为空', 'error');
        
        modalConfirm.textContent = '创建中...';
        modalConfirm.disabled = true;
        
        try {
            const res = await fetch('/api/wiki/new-category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryName: newCat })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast('分类创建成功', 'success');
                categorySelect.add(new Option(newCat, newCat, true, true));
                categorySelect.value = newCat;
                updatePreview();
                window.closeResetModal();
            } else {
                showToast(data.error, 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        } finally {
            modalConfirm.textContent = '确认创建';
            modalConfirm.disabled = false;
        }
    });

    saveBtn.addEventListener('click', async () => {
        parseAndSyncInput(); 
        
        const finalPath = getFinalPath();
        if (!finalPath) return showToast('请输入词条名', 'error');
        
        const content = contentInput.value;

        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-70');
        btnText.textContent = '正在推送...';
        btnLoading.classList.remove('hidden');

        try {
            const res = await fetch('/api/wiki/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: finalPath, content })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast('保存成功，正在构建', 'success');
                isSaved = true;
                sessionStorage.setItem('current_wiki_path', finalPath);
                
                const displayPath = finalPath.replace('.md', '');
                if (!allWikiFiles.includes(displayPath)) {
                    allWikiFiles.push(displayPath);
                    const option = document.createElement('option');
                    option.value = displayPath;
                    datalist.appendChild(option);
                }
            } else {
                throw new Error(data.error || '保存失败');
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-70');
            btnText.textContent = '保存并同步至 Wiki';
            btnLoading.classList.add('hidden');
        }
    });

    // 启动初始化
    init();
});