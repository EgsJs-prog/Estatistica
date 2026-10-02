/* ============================================================
   Estatística Descritiva – Dados Qualitativos
   Main Application Logic
   ============================================================ */

(function () {
  'use strict';

  // ---- Constants ----
  var COLORS = [
    '#1a5276', '#2e86c1', '#27ae60', '#e67e22', '#8e44ad',
    '#c0392b', '#16a085', '#d4ac0d', '#2c3e50', '#e74c3c',
    '#3498db', '#1abc9c'
  ];
  var STORAGE_KEY = 'estat_analyses';
  var DRAFT_KEY = 'estat_draft';

  // ---- DOM helpers ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function fmt(x, d) { return x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function show(el) { el.style.display = ''; }
  function hide(el) { el.style.display = 'none'; }
  function addClass(el, c) { el.classList.add(c); }
  function removeClass(el, c) { el.classList.remove(c); }
  function toggleClass(el, c, v) { if (v) addClass(el, c); else removeClass(el, c); }

  // ---- State ----
  var state = {
    currentStep: 0, // 0=home, 1=data, 2=type, 3=results
    varName: '',
    rawData: '',
    varType: 'nom',
    parsedItems: [],
    categories: {},
    categoryOrder: [],
    ordinalOrder: [],
    lastResult: null,
    dataChanged: false,
    editingId: null
  };

  // ---- Navigation ----
  function goTo(step) {
    state.currentStep = step;
    var screens = ['screen-home', 'screen-step1', 'screen-step2', 'screen-step3'];
    screens.forEach(function (id, i) {
      var el = $(id);
      if (i === step) { show(el); addClass(el, 'active'); }
      else { hide(el); removeClass(el, 'active'); }
    });

    // Step indicator
    if (step >= 1 && step <= 3) {
      show($('step-indicator'));
      var dots = document.querySelectorAll('.step-dot');
      var lines = document.querySelectorAll('.step-line');
      dots.forEach(function (d, i) {
        var s = i + 1;
        toggleClass(d, 'active', s === step);
        toggleClass(d, 'completed', s < step);
      });
      lines.forEach(function (l, i) {
        toggleClass(l, 'completed', i + 1 < step);
      });
    } else {
      hide($('step-indicator'));
    }

    // Scroll to top
    window.scrollTo(0, 0);
    saveDraft();
  }

  // ---- Step navigation via dots ----
  document.querySelectorAll('.step-dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      var target = parseInt(dot.getAttribute('data-step'));
      if (target < state.currentStep) {
        goTo(target);
      } else if (target === 3 && state.lastResult) {
        goTo(3);
      }
    });
  });

  // ---- Data Parsing ----
  function parseData(raw) {
    var items = raw.split(/[\n;,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var adjustments = [];
    var originalCount = raw.split(/[\n;,]+/).length;
    var emptyRemoved = originalCount - items.length;
    if (emptyRemoved > 0 && items.length > 0) {
      adjustments.push(emptyRemoved + ' entrada(s) vazia(s) ignorada(s).');
    }

    // Trim extra spaces within items
    var trimmed = 0;
    items = items.map(function (s) {
      var cleaned = s.replace(/\s+/g, ' ');
      if (cleaned !== s) trimmed++;
      return cleaned;
    });
    if (trimmed > 0) {
      adjustments.push('Espaços extras removidos de ' + trimmed + ' observação(ões).');
    }

    return { items: items, adjustments: adjustments };
  }

  function buildCategories(items) {
    var map = {};
    var order = [];
    items.forEach(function (s) {
      var k = s.toLowerCase();
      if (!(k in map)) {
        map[k] = { nome: s, fi: 0, key: k };
        order.push(k);
      }
      map[k].fi++;
    });
    return { map: map, order: order };
  }

  function findDuplicates(map) {
    var keys = Object.keys(map);
    var dupes = [];
    for (var i = 0; i < keys.length; i++) {
      for (var j = i + 1; j < keys.length; j++) {
        var a = map[keys[i]].nome;
        var b = map[keys[j]].nome;
        if (a.toLowerCase() === b.toLowerCase()) continue; // same key, shouldn't happen
        // Check if they differ only by case
        if (a.toLowerCase().replace(/\s+/g, '') === b.toLowerCase().replace(/\s+/g, '')) {
          dupes.push({ a: a, b: b, keyA: keys[i], keyB: keys[j] });
        }
        // Check accent differences (normalize)
        else if (typeof a.normalize === 'function') {
          var na = a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          var nb = b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          if (na === nb || (na.replace(/\s+/g, '') === nb.replace(/\s+/g, ''))) {
            // Only suggest if they look like duplicates, not different meanings
            // We'll show them but let the user decide
          }
        }
        // Simple case difference check
        if (a !== b && a.toLowerCase() === b.toLowerCase()) {
          // Already handled by key, shouldn't reach here with proper key logic
        }
      }
    }

    // Check for case-only differences in original forms
    var formsByKey = {};
    Object.keys(map).forEach(function (k) {
      // We already group by lowercase key, so duplicates are items where
      // the user typed the same word with different casing at different times.
      // Since buildCategories groups by lowercase, we need to look at raw items.
    });

    return dupes;
  }

  function findCaseDuplicates(items) {
    // Find items that differ only in case/spacing
    var seen = {};
    var dupes = [];
    items.forEach(function (s) {
      var k = s.toLowerCase().trim();
      if (!seen[k]) seen[k] = [];
      var alreadyHas = seen[k].some(function (x) { return x === s; });
      if (!alreadyHas) seen[k].push(s);
    });

    Object.keys(seen).forEach(function (k) {
      if (seen[k].length > 1) {
        dupes.push({ forms: seen[k], key: k });
      }
    });
    return dupes;
  }

  // ---- Data Preview ----
  function updatePreview() {
    var raw = $('field-data').value.trim();
    var previewEl = $('data-preview');
    var dupWarning = $('duplicate-warning');

    if (!raw) {
      hide(previewEl);
      hide(dupWarning);
      return;
    }

    var parsed = parseData(raw);
    if (parsed.items.length === 0) {
      hide(previewEl);
      hide(dupWarning);
      return;
    }

    var cats = buildCategories(parsed.items);
    show(previewEl);

    $('preview-count').textContent = parsed.items.length + ' observações, ' + cats.order.length + ' categorias';

    var tagsHtml = '';
    cats.order.forEach(function (k) {
      var c = cats.map[k];
      tagsHtml += '<span class="preview-tag">' + esc(c.nome) +
        ' <span class="tag-count">' + c.fi + '</span></span>';
    });
    $('preview-categories').innerHTML = tagsHtml;

    // Adjustments
    var adjEl = $('preview-adjustments');
    if (parsed.adjustments.length > 0) {
      show(adjEl);
      adjEl.textContent = parsed.adjustments.join(' ');
    } else {
      hide(adjEl);
    }

    // Duplicate detection
    var dupes = findCaseDuplicates(parsed.items);
    if (dupes.length > 0) {
      show(dupWarning);
      var dupHtml = '';
      dupes.forEach(function (d) {
        dupHtml += '<div class="duplicate-item"><span>"' + esc(d.forms.join('" e "')) +
          '" parecem ser a mesma categoria</span>' +
          '<button class="btn btn-small btn-secondary" onclick="window.EstatApp.mergeDuplicate(\'' +
          esc(d.key) + '\')">Agrupar</button></div>';
      });
      $('duplicate-list').innerHTML = dupHtml;
    } else {
      hide(dupWarning);
    }

    // Store parsed state
    state.parsedItems = parsed.items;
    state.categories = cats.map;
    state.categoryOrder = cats.order;
  }

  // ---- Merge Duplicates ----
  function mergeDuplicate(key) {
    var raw = $('field-data').value;
    var items = raw.split(/[\n;,]+/).map(function (s) { return s.trim(); }).filter(Boolean);

    // Find all forms matching this key
    var forms = [];
    items.forEach(function (s) {
      if (s.toLowerCase().trim() === key && forms.indexOf(s) < 0) {
        forms.push(s);
      }
    });

    if (forms.length <= 1) return;

    // Use the first occurrence as canonical
    var canonical = forms[0];
    var newItems = items.map(function (s) {
      if (s.toLowerCase().trim() === key) return canonical;
      return s;
    });

    $('field-data').value = newItems.join(', ');
    updatePreview();
    showToast('Categorias agrupadas como "' + canonical + '"');
  }

  // ---- Ordinal Ordering UI ----
  function buildOrdinalList() {
    var list = $('ordinal-list');
    if (!list) return;

    // Use current category order or stored ordinal order
    var cats;
    if (state.ordinalOrder.length > 0) {
      // Validate: ensure all current categories are in ordinal order
      var currentKeys = state.categoryOrder.slice();
      var validOrder = state.ordinalOrder.filter(function (k) { return currentKeys.indexOf(k) >= 0; });
      var missing = currentKeys.filter(function (k) { return validOrder.indexOf(k) < 0; });
      cats = validOrder.concat(missing);
    } else {
      cats = state.categoryOrder.slice();
    }

    state.ordinalOrder = cats;

    var html = '';
    cats.forEach(function (key, i) {
      var cat = state.categories[key];
      if (!cat) return;
      html += '<div class="ordinal-item" role="listitem" draggable="true" data-key="' + esc(key) + '" data-index="' + i + '">' +
        '<span class="ordinal-item-pos">' + (i + 1) + '</span>' +
        '<span class="ordinal-item-grip" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/>' +
        '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>' +
        '<circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>' +
        '<span class="ordinal-item-name">' + esc(cat.nome) + '</span>' +
        '<div class="ordinal-item-actions">' +
        '<button class="ordinal-btn" data-dir="up" data-index="' + i + '" title="Subir"' +
        (i === 0 ? ' disabled' : '') + '>' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg></button>' +
        '<button class="ordinal-btn" data-dir="down" data-index="' + i + '" title="Descer"' +
        (i === cats.length - 1 ? ' disabled' : '') + '>' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>' +
        '</div></div>';
    });

    list.innerHTML = html;

    // Attach up/down button handlers
    list.querySelectorAll('.ordinal-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = parseInt(btn.getAttribute('data-index'));
        var dir = btn.getAttribute('data-dir');
        moveOrdinalItem(idx, dir === 'up' ? -1 : 1);
      });
    });

    // Attach drag handlers
    setupDragAndDrop(list);
  }

  function moveOrdinalItem(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.ordinalOrder.length) return;
    var temp = state.ordinalOrder[index];
    state.ordinalOrder[index] = state.ordinalOrder[newIndex];
    state.ordinalOrder[newIndex] = temp;
    buildOrdinalList();
  }

  function setupDragAndDrop(list) {
    var dragSrc = null;

    list.querySelectorAll('.ordinal-item').forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        dragSrc = item;
        addClass(item, 'dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.getAttribute('data-index'));
      });

      item.addEventListener('dragend', function () {
        removeClass(item, 'dragging');
        list.querySelectorAll('.ordinal-item').forEach(function (i) {
          removeClass(i, 'drag-over');
        });
      });

      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== dragSrc) addClass(item, 'drag-over');
      });

      item.addEventListener('dragleave', function () {
        removeClass(item, 'drag-over');
      });

      item.addEventListener('drop', function (e) {
        e.preventDefault();
        removeClass(item, 'drag-over');
        if (dragSrc === item) return;
        var fromIdx = parseInt(dragSrc.getAttribute('data-index'));
        var toIdx = parseInt(item.getAttribute('data-index'));
        var moved = state.ordinalOrder.splice(fromIdx, 1)[0];
        state.ordinalOrder.splice(toIdx, 0, moved);
        buildOrdinalList();
      });

      // Touch drag support
      var touchStartY = 0;
      var touchClone = null;
      var touchItem = null;

      item.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        touchItem = item;
        touchStartY = e.touches[0].clientY;
        // Don't add dragging class immediately to allow scrolling
      }, { passive: true });

      item.addEventListener('touchmove', function (e) {
        if (!touchItem) return;
        e.preventDefault();
        addClass(touchItem, 'dragging');
        var touch = e.touches[0];
        var elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        list.querySelectorAll('.ordinal-item').forEach(function (i) { removeClass(i, 'drag-over'); });
        elements.forEach(function (el) {
          if (el.classList && el.classList.contains('ordinal-item') && el !== touchItem) {
            addClass(el, 'drag-over');
          }
        });
      }, { passive: false });

      item.addEventListener('touchend', function (e) {
        if (!touchItem) return;
        removeClass(touchItem, 'dragging');
        var touch = e.changedTouches[0];
        var elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        var target = null;
        elements.forEach(function (el) {
          if (el.classList && el.classList.contains('ordinal-item') && el !== touchItem && !target) {
            target = el;
          }
        });
        list.querySelectorAll('.ordinal-item').forEach(function (i) { removeClass(i, 'drag-over'); });
        if (target) {
          var fromIdx = parseInt(touchItem.getAttribute('data-index'));
          var toIdx = parseInt(target.getAttribute('data-index'));
          var moved = state.ordinalOrder.splice(fromIdx, 1)[0];
          state.ordinalOrder.splice(toIdx, 0, moved);
          buildOrdinalList();
        }
        touchItem = null;
      });
    });
  }

  // ---- Calculation Engine ----
  function calculate() {
    var items = state.parsedItems;
    var map = state.categories;
    var n = items.length;
    var cats;

    if (state.varType === 'ord') {
      // Use ordinal order
      cats = state.ordinalOrder.map(function (k) {
        var c = map[k];
        if (!c) return null;
        return { nome: c.nome, fi: c.fi, key: k };
      }).filter(Boolean);
    } else {
      // Nominal: sort by frequency descending
      cats = state.categoryOrder.map(function (k) { return map[k]; })
        .sort(function (a, b) { return b.fi - a.fi; });
    }

    // Calculate frequencies with full precision
    var isOrd = state.varType === 'ord';
    var ac = 0;
    cats.forEach(function (c, i) {
      c.fr = c.fi / n;
      ac += c.fi;
      if (isOrd) {
        c.fac = ac;
        c.frac = ac / n;
      }
      c.cor = COLORS[i % COLORS.length];
    });

    state.lastResult = {
      v: state.varName || 'Variável',
      n: n,
      cats: cats,
      ord: isOrd
    };
    state.dataChanged = false;
    hide($('stale-warning'));

    return state.lastResult;
  }

  // ---- Render Results ----
  function renderResults() {
    var L = state.lastResult;
    if (!L) return;

    var c = L.cats;
    var n = L.n;

    // Summary cards
    $('sum-total').textContent = n;
    $('sum-cats').textContent = c.length;

    var mx = Math.max.apply(null, c.map(function (x) { return x.fi; }));
    var modas = c.filter(function (x) { return x.fi === mx; });

    if (modas.length === 1) {
      $('sum-moda').textContent = modas[0].nome;
      $('sum-moda-label').textContent = fmt(modas[0].fr * 100, 1) + '% do total';
    } else {
      $('sum-moda').textContent = 'Empate';
      $('sum-moda-label').textContent = modas.length + ' categorias com ' + mx;
    }

    // Interpretation
    renderInterpretation(L, c, n, mx, modas);

    // Calculation explanation
    renderCalcExplanation(L, c, n);

    // Table
    renderTable(L, c, n);

    // Charts
    renderBarChart(c, mx);
    renderPieChart(c);
    renderLegend(c);

    // Variable name in table
    $('table-var-name').textContent = L.v;
  }

  function renderInterpretation(L, c, n, mx, modas) {
    var t = 'Foram analisadas <b>' + n + '</b> observações da variável <b>' + esc(L.v) + '</b> (' +
      (L.ord ? 'qualitativa ordinal' : 'qualitativa nominal') + '), distribuídas em <b>' + c.length + '</b> categorias. ';

    if (modas.length === 1) {
      t += 'A categoria mais frequente (moda) é <b>' + esc(modas[0].nome) + '</b>, com ' +
        mx + ' ocorrências (' + fmt(modas[0].fr * 100, 1) + '% do total). ';
    } else {
      t += 'Há empate na moda entre ' + modas.map(function (m) {
        return '<b>' + esc(m.nome) + '</b>';
      }).join(' e ') + ', cada uma com ' + mx + ' ocorrências (' + fmt(modas[0].fr * 100, 1) + '%). ';
    }

    var mn = c.reduce(function (a, b) { return b.fi < a.fi ? b : a; });
    if (mn.fi !== mx) {
      t += 'A menos frequente é <b>' + esc(mn.nome) + '</b>, com ' + mn.fi + ' ocorrências (' + fmt(mn.fr * 100, 1) + '%).';
    }

    if (L.ord) {
      // Add ordinal-specific interpretation
      var medianIdx = 0;
      var cumSum = 0;
      var medianPos = Math.ceil(n / 2);
      for (var i = 0; i < c.length; i++) {
        cumSum += c[i].fi;
        if (cumSum >= medianPos) { medianIdx = i; break; }
      }
      t += ' Na escala ordinal definida, a posição central (mediana) encontra-se na categoria <b>' + esc(c[medianIdx].nome) + '</b>.';
    }

    $('interp-text').innerHTML = t;
  }

  function renderCalcExplanation(L, c, n) {
    var ex = c[0]; // Use first category as example
    var html = '<p><strong>Como os valores são calculados:</strong></p>';
    html += '<p>Para a categoria <strong>"' + esc(ex.nome) + '"</strong>:</p>';
    html += '<ul style="margin:8px 0;padding-left:20px;list-style:disc">';
    html += '<li><strong>Frequência absoluta (fi):</strong> ' + ex.nome + ' apareceu <code>' + ex.fi + '</code> vezes</li>';
    html += '<li><strong>Frequência relativa (fr):</strong> <code>' + ex.fi + ' ÷ ' + n + ' = ' + fmt(ex.fr, 4) + '</code></li>';
    html += '<li><strong>Percentual:</strong> <code>' + fmt(ex.fr, 4) + ' × 100 = ' + fmt(ex.fr * 100, 2) + '%</code></li>';
    if (L.ord && ex.fac !== undefined) {
      html += '<li><strong>Frequência acumulada (Fac):</strong> soma progressiva = <code>' + ex.fac + '</code></li>';
      html += '<li><strong>Percentual acumulado:</strong> <code>' + ex.fac + ' ÷ ' + n + ' × 100 = ' + fmt(ex.frac * 100, 2) + '%</code></li>';
    }
    html += '</ul>';
    html += '<p style="margin-top:8px;color:var(--text-muted)"><strong>Fórmulas:</strong> fr = fi ÷ n &nbsp;|&nbsp; percentual = fr × 100</p>';

    $('calc-explanation').innerHTML = html;
  }

  function renderTable(L, c, n) {
    var h = '<thead><tr><th>Categoria</th><th>Quantidade (fi)</th><th>Proporção (fr)</th><th>Percentual</th>' +
      (L.ord ? '<th>Acum. (Fac)</th><th>% Acum.</th>' : '') + '</tr></thead><tbody>';

    var percentSum = 0;
    c.forEach(function (x) {
      var pct = x.fr * 100;
      var pctRounded = Math.round(pct * 100) / 100;
      percentSum += pctRounded;
      h += '<tr><td>' + esc(x.nome) + '</td><td>' + x.fi + '</td><td>' + fmt(x.fr, 4) + '</td><td>' + fmt(pct, 2) + '%</td>' +
        (L.ord ? '<td>' + x.fac + '</td><td>' + fmt(x.frac * 100, 2) + '%</td>' : '') + '</tr>';
    });

    h += '</tbody><tfoot><tr><td>Total</td><td>' + n + '</td><td>' + fmt(1, 4) + '</td><td>100,00%</td>' +
      (L.ord ? '<td></td><td></td>' : '') + '</tr></tfoot>';

    $('freq-table').innerHTML = h;

    // Table note
    var noteText = 'fi = frequência absoluta; fr = frequência relativa (fi/n)';
    if (L.ord) {
      noteText += '; Fac = frequência absoluta acumulada; % Acum. = frequência relativa acumulada em percentual.';
    } else {
      noteText += '. Categorias em ordem decrescente de frequência.';
    }
    $('table-note').textContent = noteText;

    // Rounding note
    var roundingEl = $('rounding-note');
    var diff = Math.abs(percentSum - 100);
    if (diff > 0.001 && diff < 1) {
      show(roundingEl);
      roundingEl.textContent = 'A soma dos percentuais pode diferir ligeiramente de 100% devido ao arredondamento de cada valor individual.';
    } else {
      hide(roundingEl);
    }
  }

  function renderBarChart(c, mx) {
    var W = 640, H = 360;
    var l = 54, r = 16, tp = 24, b = c.length > 6 ? 100 : 56;
    var pw = W - l - r, ph = H - tp - b;

    var passo = Math.max(1, Math.ceil(mx / 5));
    var top = Math.ceil(mx / passo) * passo;

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras: ' + esc(state.lastResult.v) + '">';

    // Grid lines
    for (var v = 0; v <= top; v += passo) {
      var y = tp + ph - ph * v / top;
      s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e6ed" stroke-width="1"/>';
      s += '<text x="' + (l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#8893a4" font-family="Inter,sans-serif">' + v + '</text>';
    }

    var bw = pw / c.length;
    c.forEach(function (x, i) {
      var w = Math.min(bw * 0.65, 72);
      var cx = l + bw * i + bw / 2;
      var h = ph * x.fi / top;
      var yb = tp + ph - h;

      // Bar
      s += '<rect x="' + (cx - w / 2) + '" y="' + yb + '" width="' + w + '" height="' + h + '" rx="4" fill="' + x.cor + '">';
      s += '<title>' + esc(x.nome) + ': ' + x.fi + ' (' + fmt(x.fr * 100, 1) + '%)</title></rect>';

      // Value label on bar
      s += '<text x="' + cx + '" y="' + (yb - 6) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + x.cor + '" font-family="Inter,sans-serif">' + x.fi + '</text>';

      // Category label
      var lb = x.nome.length > 15 ? x.nome.slice(0, 14) + '…' : x.nome;
      var ly = tp + ph + 18;
      if (c.length > 6) {
        s += '<text transform="translate(' + cx + ',' + ly + ') rotate(-40)" text-anchor="end" font-size="11" fill="#5a6577" font-family="Inter,sans-serif">' + esc(lb) + '</text>';
      } else {
        s += '<text x="' + cx + '" y="' + ly + '" text-anchor="middle" font-size="11" fill="#5a6577" font-family="Inter,sans-serif">' + esc(lb) + '</text>';
      }

      // Percentage below count on mobile (always visible)
      if (c.length <= 6) {
        s += '<text x="' + cx + '" y="' + (ly + 14) + '" text-anchor="middle" font-size="10" fill="#8893a4" font-family="Inter,sans-serif">' + fmt(x.fr * 100, 1) + '%</text>';
      }
    });

    // X axis
    s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + (tp + ph) + '" y2="' + (tp + ph) + '" stroke="#ccd0d8" stroke-width="1"/>';

    // Y axis label
    s += '<text x="14" y="' + (tp + ph / 2) + '" font-size="11" fill="#8893a4" font-family="Inter,sans-serif" transform="rotate(-90 14 ' + (tp + ph / 2) + ')" text-anchor="middle">Frequência absoluta</text>';

    s += '</svg>';
    $('bar-chart').innerHTML = s;
  }

  function renderPieChart(c) {
    var R = 120, cx = 160, cy = 145;
    var s = '<svg viewBox="0 0 320 290" role="img" aria-label="Gráfico de setores: ' + esc(state.lastResult.v) + '">';
    var a = -Math.PI / 2;

    c.forEach(function (x) {
      var d = x.fr * 2 * Math.PI;
      var title = '<title>' + esc(x.nome) + ': ' + x.fi + ' (' + fmt(x.fr * 100, 1) + '%)</title>';

      if (x.fr >= 0.9999) {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + x.cor + '">' + title + '</circle>';
      } else {
        var x1 = cx + R * Math.cos(a);
        var y1 = cy + R * Math.sin(a);
        var x2 = cx + R * Math.cos(a + d);
        var y2 = cy + R * Math.sin(a + d);
        var large = d > Math.PI ? 1 : 0;
        s += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + x.cor + '" stroke="#fff" stroke-width="2">' + title + '</path>';
      }

      // Label
      if (x.fr >= 0.05) {
        var m = a + d / 2;
        var labelR = R * 0.65;
        var lx = cx + labelR * Math.cos(m);
        var ly = cy + labelR * Math.sin(m);
        s += '<text x="' + lx + '" y="' + (ly + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Inter,sans-serif">' + fmt(x.fr * 100, 1) + '%</text>';
      }
      a += d;
    });

    s += '</svg>';
    $('pie-chart').innerHTML = s;
  }

  function renderLegend(c) {
    var html = '';
    c.forEach(function (x) {
      html += '<span class="legend-item"><span class="legend-swatch" style="background:' + x.cor + '"></span>' +
        esc(x.nome) + ' (' + x.fi + ')</span>';
    });
    $('chart-legend').innerHTML = html;
  }

  // ---- CSV Export ----
  function exportCSV() {
    var L = state.lastResult;
    if (!L) return;

    var rows = ['Categoria;fi;fr;fr(%)' + (L.ord ? ';Fac;Frac(%)' : '')];
    L.cats.forEach(function (x) {
      var row = [
        x.nome,
        x.fi,
        x.fr.toFixed(4).replace('.', ','),
        (x.fr * 100).toFixed(2).replace('.', ',')
      ];
      if (L.ord) {
        row.push(x.fac);
        row.push((x.frac * 100).toFixed(2).replace('.', ','));
      }
      rows.push(row.join(';'));
    });

    var totalRow = ['Total', L.n, '1,0000', '100,00'];
    if (L.ord) totalRow.push('', '');
    rows.push(totalRow.join(';'));

    var blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tabela_frequencia_' + (L.v || 'variavel').replace(/\s+/g, '_').toLowerCase() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Tabela exportada em CSV');
  }

  // ---- Validation ----
  function validateStep1() {
    var raw = $('field-data').value.trim();
    var errEl = $('step1-error');
    hide(errEl);
    removeClass($('field-data'), 'has-error');

    if (!raw) {
      show(errEl);
      errEl.textContent = 'Informe os dados: o campo de observações está vazio.';
      addClass($('field-data'), 'has-error');
      return false;
    }

    var parsed = parseData(raw);
    if (parsed.items.length < 2) {
      show(errEl);
      errEl.textContent = 'Informe pelo menos 2 observações para realizar a análise.';
      addClass($('field-data'), 'has-error');
      return false;
    }

    // Check if all values are numeric
    var nums = parsed.items.filter(function (s) { return /^-?\d+([.,]\d+)?$/.test(s); }).length;
    if (nums === parsed.items.length) {
      show(errEl);
      errEl.textContent = 'Todos os valores são numéricos. Esta ferramenta trata dados qualitativos (categorias). Confira se a variável não é quantitativa.';
      addClass($('field-data'), 'has-error');
      return false;
    }

    var cats = buildCategories(parsed.items);
    if (cats.order.length < 2) {
      show(errEl);
      errEl.textContent = 'Foi encontrada apenas 1 categoria. Informe dados com pelo menos 2 categorias distintas para comparação.';
      addClass($('field-data'), 'has-error');
      return false;
    }

    // Store parsed state
    state.parsedItems = parsed.items;
    state.categories = cats.map;
    state.categoryOrder = cats.order;
    state.varName = $('field-name').value.trim();
    state.rawData = raw;

    return true;
  }

  function validateStep2() {
    var errEl = $('step2-error');
    hide(errEl);

    state.varType = document.querySelector('input[name="var-type"]:checked').value;

    if (state.varType === 'ord') {
      // Validate ordinal order has all categories
      if (state.ordinalOrder.length === 0) {
        show(errEl);
        errEl.textContent = 'Defina a ordem das categorias antes de continuar.';
        return false;
      }

      var currentKeys = state.categoryOrder.slice();
      var missing = currentKeys.filter(function (k) { return state.ordinalOrder.indexOf(k) < 0; });
      if (missing.length > 0) {
        show(errEl);
        errEl.textContent = 'Categorias ausentes na ordenação: ' + missing.map(function (k) { return state.categories[k].nome; }).join(', ');
        return false;
      }
    }

    return true;
  }

  // ---- Example Data ----
  function mixData(counts) {
    var keys = Object.keys(counts);
    var out = [];
    var left = true;
    while (left) {
      left = false;
      keys.forEach(function (k) {
        if (counts[k] > 0) {
          out.push(k);
          counts[k]--;
          left = true;
        }
      });
    }
    return out.join(', ');
  }

  function loadExample(type) {
    if (type === 'transport') {
      state.varName = 'Meio de transporte dos alunos';
      state.rawData = mixData({ 'Ônibus': 14, 'A pé': 8, 'Carro': 7, 'Moto': 6, 'Bicicleta': 5 });
      state.varType = 'nom';
      state.ordinalOrder = [];
    } else {
      state.varName = 'Grau de satisfação com o curso';
      state.rawData = mixData({ 'Muito insatisfeito': 3, 'Insatisfeito': 5, 'Neutro': 9, 'Satisfeito': 14, 'Muito satisfeito': 9 });
      state.varType = 'ord';
      state.ordinalOrder = [];
    }

    $('field-name').value = state.varName;
    $('field-data').value = state.rawData;

    // Parse
    var parsed = parseData(state.rawData);
    state.parsedItems = parsed.items;
    var cats = buildCategories(parsed.items);
    state.categories = cats.map;
    state.categoryOrder = cats.order;

    // Set type
    document.querySelector('input[name="var-type"][value="' + state.varType + '"]').checked = true;
    toggleOrdinalSection();

    if (state.varType === 'ord') {
      // Set predefined order for satisfaction example
      state.ordinalOrder = ['muito insatisfeito', 'insatisfeito', 'neutro', 'satisfeito', 'muito satisfeito'];
      buildOrdinalList();
    }

    // Calculate and show results
    calculate();
    renderResults();
    goTo(3);

    showToast('Exemplo carregado: ' + state.varName);
  }

  // ---- Type Toggle ----
  function toggleOrdinalSection() {
    var isOrd = document.querySelector('input[name="var-type"]:checked').value === 'ord';
    var section = $('ordinal-section');
    if (isOrd) {
      show(section);
      if (state.categoryOrder.length > 0) {
        buildOrdinalList();
      }
    } else {
      hide(section);
    }
  }

  // ---- Saved Analyses ----
  function getSavedAnalyses() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAnalyses(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      showToast('Erro ao salvar. Verifique o espaço disponível.');
    }
  }

  function saveCurrentAnalysis(name) {
    if (!state.lastResult) return;

    var analysis = {
      id: state.editingId || Date.now().toString(),
      name: name,
      date: new Date().toISOString(),
      varName: state.varName,
      rawData: state.rawData,
      varType: state.varType,
      ordinalOrder: state.ordinalOrder.slice()
    };

    var list = getSavedAnalyses();
    var existingIdx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === analysis.id) { existingIdx = i; break; }
    }

    if (existingIdx >= 0) {
      list[existingIdx] = analysis;
    } else {
      list.unshift(analysis);
    }

    saveAnalyses(list);
    state.editingId = analysis.id;
    updateSavedBadge();
    showToast('Análise salva: ' + name);
  }

  function loadAnalysis(id) {
    var list = getSavedAnalyses();
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { found = list[i]; break; }
    }
    if (!found) return;

    state.editingId = found.id;
    state.varName = found.varName;
    state.rawData = found.rawData;
    state.varType = found.varType;
    state.ordinalOrder = found.ordinalOrder || [];

    $('field-name').value = state.varName;
    $('field-data').value = state.rawData;
    document.querySelector('input[name="var-type"][value="' + state.varType + '"]').checked = true;
    toggleOrdinalSection();

    // Parse
    var parsed = parseData(state.rawData);
    state.parsedItems = parsed.items;
    var cats = buildCategories(parsed.items);
    state.categories = cats.map;
    state.categoryOrder = cats.order;

    if (state.varType === 'ord' && state.ordinalOrder.length > 0) {
      buildOrdinalList();
    }

    calculate();
    renderResults();
    goTo(3);

    hideModal('modal-saved');
    showToast('Análise carregada: ' + found.name);
  }

  function deleteAnalysis(id) {
    var list = getSavedAnalyses();
    list = list.filter(function (a) { return a.id !== id; });
    saveAnalyses(list);
    updateSavedBadge();
    renderSavedList();
    showToast('Análise excluída');
  }

  function renameAnalysis(id, newName) {
    var list = getSavedAnalyses();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].name = newName;
        break;
      }
    }
    saveAnalyses(list);
    renderSavedList();
    showToast('Análise renomeada');
  }

  function renderSavedList() {
    var list = getSavedAnalyses();
    var container = $('saved-list');
    var emptyEl = $('saved-empty');

    if (list.length === 0) {
      hide(container);
      show(emptyEl);
      return;
    }

    show(container);
    hide(emptyEl);

    var html = '';
    list.forEach(function (a) {
      var date = new Date(a.date);
      var dateStr = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      html += '<div class="saved-item">' +
        '<div class="saved-item-info" data-id="' + a.id + '">' +
        '<strong>' + esc(a.name) + '</strong>' +
        '<span>' + esc(a.varName) + ' · ' + (a.varType === 'ord' ? 'Ordinal' : 'Nominal') + ' · ' + dateStr + '</span>' +
        '</div>' +
        '<div class="saved-item-actions">' +
        '<button class="btn-danger-text" data-rename="' + a.id + '" title="Renomear">✏️</button>' +
        '<button class="btn-danger-text" data-delete="' + a.id + '" title="Excluir">🗑️</button>' +
        '</div></div>';
    });
    container.innerHTML = html;

    // Attach handlers
    container.querySelectorAll('.saved-item-info').forEach(function (el) {
      el.addEventListener('click', function () {
        loadAnalysis(el.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Excluir esta análise?')) {
          deleteAnalysis(btn.getAttribute('data-delete'));
        }
      });
    });
    container.querySelectorAll('[data-rename]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-rename');
        var a = getSavedAnalyses().find(function (x) { return x.id === id; });
        if (!a) return;
        $('rename-name').value = a.name;
        $('modal-rename').setAttribute('data-id', id);
        showModal('modal-rename');
      });
    });

    // Update home screen saved section
    renderHomeSaved(list);
  }

  function renderHomeSaved(list) {
    var section = $('home-saved-section');
    var container = $('home-saved-list');

    if (!list || list.length === 0) {
      hide(section);
      return;
    }

    show(section);
    var html = '';
    var shown = list.slice(0, 3);
    shown.forEach(function (a) {
      html += '<div class="saved-compact-item" data-load="' + a.id + '">' +
        '<strong>' + esc(a.name) + '</strong>' +
        '<span>' + (a.varType === 'ord' ? 'Ordinal' : 'Nominal') + '</span></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.saved-compact-item').forEach(function (el) {
      el.addEventListener('click', function () {
        loadAnalysis(el.getAttribute('data-load'));
      });
    });
  }

  function updateSavedBadge() {
    var list = getSavedAnalyses();
    var badge = $('saved-badge');
    if (list.length > 0) {
      show(badge);
    } else {
      hide(badge);
    }
  }

  // ---- Draft Persistence ----
  function saveDraft() {
    try {
      var draft = {
        varName: $('field-name') ? $('field-name').value : '',
        rawData: $('field-data') ? $('field-data').value : '',
        varType: document.querySelector('input[name="var-type"]:checked') ?
          document.querySelector('input[name="var-type"]:checked').value : 'nom',
        ordinalOrder: state.ordinalOrder,
        currentStep: state.currentStep
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) { /* ignore */ }
  }

  function loadDraft() {
    try {
      var data = localStorage.getItem(DRAFT_KEY);
      if (!data) return false;
      var draft = JSON.parse(data);
      if (!draft.rawData) return false;

      $('field-name').value = draft.varName || '';
      $('field-data').value = draft.rawData || '';

      var typeInput = document.querySelector('input[name="var-type"][value="' + (draft.varType || 'nom') + '"]');
      if (typeInput) typeInput.checked = true;

      state.ordinalOrder = draft.ordinalOrder || [];
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  // ---- Modals ----
  function showModal(id) {
    var modal = $(id);
    show(modal);
    // Focus first focusable element
    setTimeout(function () {
      var focusable = modal.querySelector('input, button:not(.modal-close-btn)');
      if (focusable) focusable.focus();
    }, 100);
  }

  function hideModal(id) {
    hide($(id));
  }

  // ---- Toast ----
  function showToast(msg) {
    var toast = $('toast');
    toast.textContent = msg;
    addClass(toast, 'visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      removeClass(toast, 'visible');
    }, 3000);
  }

  // ---- Tabs ----
  function setupTabs() {
    document.querySelectorAll('.results-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.results-tab').forEach(function (t) {
          removeClass(t, 'active');
          t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.results-panel').forEach(function (p) {
          removeClass(p, 'active');
          hide(p);
        });

        addClass(tab, 'active');
        tab.setAttribute('aria-selected', 'true');
        var panel = $(tab.getAttribute('data-tab'));
        addClass(panel, 'active');
        show(panel);
      });
    });
  }

  // ---- Chart Toggle ----
  function setupChartToggle() {
    $('btn-chart-bar').addEventListener('click', function () {
      addClass(this, 'active');
      this.setAttribute('aria-pressed', 'true');
      removeClass($('btn-chart-pie'), 'active');
      $('btn-chart-pie').setAttribute('aria-pressed', 'false');
      show($('chart-bar-container'));
      hide($('chart-pie-container'));
    });

    $('btn-chart-pie').addEventListener('click', function () {
      addClass(this, 'active');
      this.setAttribute('aria-pressed', 'true');
      removeClass($('btn-chart-bar'), 'active');
      $('btn-chart-bar').setAttribute('aria-pressed', 'false');
      show($('chart-pie-container'));
      hide($('chart-bar-container'));
    });
  }

  // ---- Event Handlers ----
  function setupEvents() {
    // Home: New analysis
    $('btn-new-analysis').addEventListener('click', function () {
      state.editingId = null;
      $('field-name').value = '';
      $('field-data').value = '';
      document.querySelector('input[name="var-type"][value="nom"]').checked = true;
      state.ordinalOrder = [];
      state.lastResult = null;
      hide($('data-preview'));
      hide($('duplicate-warning'));
      hide($('step1-error'));
      toggleOrdinalSection();
      goTo(1);
    });

    // Home: Try example
    $('btn-try-example').addEventListener('click', function () {
      showModal('modal-examples');
    });

    // Example modal
    $('ex-transport').addEventListener('click', function () {
      hideModal('modal-examples');
      loadExample('transport');
    });
    $('ex-satisfaction').addEventListener('click', function () {
      hideModal('modal-examples');
      loadExample('satisfaction');
    });
    $('modal-ex-close').addEventListener('click', function () {
      hideModal('modal-examples');
    });

    // Step 1: Data input preview
    var previewTimer;
    $('field-data').addEventListener('input', function () {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 300);
      if (state.lastResult) {
        state.dataChanged = true;
        show($('stale-warning'));
      }
      removeClass($('field-data'), 'has-error');
      hide($('step1-error'));
    });
    $('field-name').addEventListener('input', function () {
      if (state.lastResult) {
        state.dataChanged = true;
      }
    });

    // Step 1: Navigation
    $('btn-step1-back').addEventListener('click', function () {
      goTo(0);
    });
    $('btn-step1-next').addEventListener('click', function () {
      if (validateStep1()) {
        toggleOrdinalSection();
        if (state.varType === 'ord' || document.querySelector('input[name="var-type"]:checked').value === 'ord') {
          buildOrdinalList();
        }
        goTo(2);
      }
    });

    // Step 2: Type selection
    document.querySelectorAll('input[name="var-type"]').forEach(function (r) {
      r.addEventListener('change', function () {
        toggleOrdinalSection();
      });
    });

    // Step 2: Navigation
    $('btn-step2-back').addEventListener('click', function () {
      goTo(1);
    });
    $('btn-step2-next').addEventListener('click', function () {
      if (validateStep2()) {
        calculate();
        renderResults();
        goTo(3);
      }
    });

    // Step 3: Actions
    $('btn-step3-back').addEventListener('click', function () {
      goTo(2);
    });
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-print').addEventListener('click', function () {
      window.print();
    });
    $('btn-recalc').addEventListener('click', function () {
      // Re-parse and re-calculate
      state.rawData = $('field-data').value.trim();
      state.varName = $('field-name').value.trim();
      var parsed = parseData(state.rawData);
      state.parsedItems = parsed.items;
      var cats = buildCategories(parsed.items);
      state.categories = cats.map;
      state.categoryOrder = cats.order;
      calculate();
      renderResults();
      hide($('stale-warning'));
      state.dataChanged = false;
      showToast('Resultados atualizados');
    });

    // Save analysis
    $('btn-save-analysis').addEventListener('click', function () {
      if (!state.lastResult) return;
      $('save-name').value = state.varName || 'Minha análise';
      showModal('modal-save');
    });
    $('modal-save-cancel').addEventListener('click', function () { hideModal('modal-save'); });
    $('modal-save-confirm').addEventListener('click', function () {
      var name = $('save-name').value.trim();
      if (!name) {
        $('save-name').focus();
        return;
      }
      saveCurrentAnalysis(name);
      hideModal('modal-save');
    });

    // Saved analyses modal
    $('btn-saved').addEventListener('click', function () {
      renderSavedList();
      showModal('modal-saved');
    });
    $('modal-saved-close').addEventListener('click', function () { hideModal('modal-saved'); });

    // Rename modal
    $('modal-rename-cancel').addEventListener('click', function () { hideModal('modal-rename'); });
    $('modal-rename-confirm').addEventListener('click', function () {
      var id = $('modal-rename').getAttribute('data-id');
      var newName = $('rename-name').value.trim();
      if (!newName) { $('rename-name').focus(); return; }
      renameAnalysis(id, newName);
      hideModal('modal-rename');
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          hide(overlay);
        }
      });
    });

    // Close modals on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(function (m) { hide(m); });
      }
    });

    // New analysis from results
    $('btn-new-from-results').addEventListener('click', function () {
      state.editingId = null;
      $('field-name').value = '';
      $('field-data').value = '';
      document.querySelector('input[name="var-type"][value="nom"]').checked = true;
      state.ordinalOrder = [];
      state.lastResult = null;
      hide($('data-preview'));
      hide($('duplicate-warning'));
      hide($('step1-error'));
      toggleOrdinalSection();
      clearDraft();
      goTo(1);
    });

    // Tabs & chart toggle
    setupTabs();
    setupChartToggle();
  }

  // ---- PWA Install ----
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    show($('btn-install'));
  });

  if ($('btn-install')) {
    $('btn-install').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (result) {
        if (result.outcome === 'accepted') {
          showToast('Aplicativo instalado com sucesso!');
        }
        deferredPrompt = null;
        hide($('btn-install'));
      });
    });
  }

  // ---- Service Worker Registration ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // Check for updates
        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'activated') {
              showToast('Aplicativo atualizado. Recarregue para ver as novidades.');
            }
          });
        });
      }).catch(function (err) {
        console.log('SW registration failed:', err);
      });
    });
  }

  // ---- Public API for inline handlers ----
  window.EstatApp = {
    mergeDuplicate: mergeDuplicate
  };

  // ---- Initialization ----
  function init() {
    updateSavedBadge();
    renderHomeSaved(getSavedAnalyses());
    setupEvents();

    // Check for draft
    if (loadDraft()) {
      // Don't auto-navigate, just have data ready
    }

    goTo(0);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
