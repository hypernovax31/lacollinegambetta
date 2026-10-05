/* Carrousel d'avis Google Places. Les contenus Places restent en mémoire vive
   et la bibliothèque Google n'est chargée qu'après une demande explicite. */
(function () {
  'use strict';
  if (document.documentElement.classList.contains('carte-doc')) return;

  var section = document.getElementById('cover-reviews-section');
  if (!section || !window.fetch) return;
  var $ = function (id) { return document.getElementById(id); };
  var title = $('cover-reviews-title');
  var intro = $('google-reviews-intro');
  var status = $('google-reviews-status');
  var loadButton = $('google-reviews-load');
  var privacyHint = $('google-reviews-privacy-hint');
  var summary = $('google-reviews-rating');
  var stars = $('google-reviews-stars');
  var starsFill = $('google-reviews-stars-fill');
  var score = $('google-reviews-score');
  var count = $('google-reviews-count');
  var carousel = $('google-reviews-carousel');
  var viewport = $('google-reviews-viewport');
  var slide = $('google-reviews-slide');
  var previous = $('google-reviews-previous');
  var next = $('google-reviews-next');
  var dots = $('google-reviews-dots');
  var disclosure = $('google-reviews-disclosure');
  var disclosureText = $('google-reviews-disclosure-text');
  var policy = $('google-reviews-policy');
  var attributions = $('google-reviews-attributions');
  var allReviews = $('google-reviews-all');
  var mapsAttribution = $('google-reviews-maps');
  if ([title, intro, status, loadButton, privacyHint, summary, stars, starsFill,
    score, count, carousel, viewport, slide, previous, next, dots, disclosure,
    disclosureText, policy, attributions, allReviews, mapsAttribution].some(function (el) { return !el; })) return;

  var COPY = {
    fr: {
      title:'Avis Google', intro:'Les commentaires publics s’affichent à votre demande.', load:'Afficher les avis Google', loading:'Chargement des avis Google…', retry:'Réessayer', error:'Les avis Google ne sont pas disponibles pour le moment.', empty:'Aucun commentaire écrit n’est disponible pour le moment.', loaded:function (n) { return n + ' avis chargés.'; }, prev:'Avis précédent', next:'Avis suivant', reviewWord:'avis', position:function (i,n) { return 'Avis ' + i + ' sur ' + n; }, visit:'Visite : ', posted:'Publié ', translated:'Texte traduit par Google.', reviewLink:'Voir cet avis sur Google Maps', disclosure:'Commentaires écrits affichés par pertinence, sans filtre de note. Google ne vérifie pas les avis, mais retire les contenus frauduleux identifiés.', policy:'Politique Google sur les avis', all:'Tous les avis', privacy:'Les avis ne sont chargés qu’après votre demande.', keyboard:'Utilisez les flèches gauche et droite pour parcourir les avis.', rating:function (v) { return 'Note moyenne Google : ' + v + ' sur 5'; }, avatar:'Photo de profil de '
    },
    en: {
      title:'Google reviews', intro:'Public comments are shown when you request them.', load:'Show Google reviews', loading:'Loading Google reviews…', retry:'Try again', error:'Google reviews are unavailable right now.', empty:'No written review is available right now.', loaded:function (n) { return n + ' reviews loaded.'; }, prev:'Previous review', next:'Next review', reviewWord:'reviews', position:function (i,n) { return 'Review ' + i + ' of ' + n; }, visit:'Visited: ', posted:'Posted ', translated:'Translated by Google.', reviewLink:'Read this review on Google Maps', disclosure:'Written reviews are shown in Google’s relevance order, with no star-rating filter. Google does not verify reviews, but removes fake content when identified.', policy:'Google review policy', all:'All reviews', privacy:'Reviews load from Google only when you request them.', keyboard:'Use the left and right arrow keys to browse reviews.', rating:function (v) { return 'Google average rating: ' + v + ' out of 5'; }, avatar:'Profile photo of '
    },
    es: {
      title:'Opiniones de Google', intro:'Los comentarios públicos se muestran cuando los solicitas.', load:'Mostrar opiniones de Google', loading:'Cargando opiniones de Google…', retry:'Intentar de nuevo', error:'Las opiniones de Google no están disponibles ahora.', empty:'No hay comentarios escritos disponibles ahora.', loaded:function (n) { return n + ' opiniones cargadas.'; }, prev:'Opinión anterior', next:'Opinión siguiente', reviewWord:'opiniones', position:function (i,n) { return 'Opinión ' + i + ' de ' + n; }, visit:'Visita: ', posted:'Publicado ', translated:'Texto traducido por Google.', reviewLink:'Leer esta opinión en Google Maps', disclosure:'Los comentarios escritos se muestran por relevancia según Google, sin filtrar por estrellas. Google no verifica las opiniones, pero elimina el contenido falso cuando lo identifica.', policy:'Política de opiniones de Google', all:'Todas las opiniones', privacy:'Las opiniones solo se cargan desde Google cuando lo solicitas.', keyboard:'Usa las flechas izquierda y derecha para recorrer las opiniones.', rating:function (v) { return 'Valoración media de Google: ' + v + ' sobre 5'; }, avatar:'Foto de perfil de '
    },
    de: {
      title:'Google-Bewertungen', intro:'Öffentliche Kommentare werden auf Ihre Anfrage angezeigt.', load:'Google-Bewertungen anzeigen', loading:'Google-Bewertungen werden geladen…', retry:'Erneut versuchen', error:'Google-Bewertungen sind momentan nicht verfügbar.', empty:'Momentan ist keine schriftliche Bewertung verfügbar.', loaded:function (n) { return n + ' Bewertungen geladen.'; }, prev:'Vorherige Bewertung', next:'Nächste Bewertung', reviewWord:'Bewertungen', position:function (i,n) { return 'Bewertung ' + i + ' von ' + n; }, visit:'Besuch: ', posted:'Veröffentlicht ', translated:'Von Google übersetzt.', reviewLink:'Diese Bewertung auf Google Maps ansehen', disclosure:'Schriftliche Bewertungen werden nach Googles Relevanz sortiert und nicht nach Sternen gefiltert. Google überprüft Bewertungen nicht, entfernt aber erkannte gefälschte Inhalte.', policy:'Google-Richtlinie zu Bewertungen', all:'Alle Bewertungen', privacy:'Bewertungen werden erst auf Ihre Anfrage von Google geladen.', keyboard:'Mit den Pfeiltasten links und rechts durch die Bewertungen blättern.', rating:function (v) { return 'Google-Durchschnitt: ' + v + ' von 5'; }, avatar:'Profilbild von '
    },
    it: {
      title:'Recensioni Google', intro:'I commenti pubblici vengono mostrati su tua richiesta.', load:'Mostra le recensioni Google', loading:'Caricamento delle recensioni Google…', retry:'Riprova', error:'Le recensioni Google non sono disponibili al momento.', empty:'Al momento non è disponibile alcuna recensione scritta.', loaded:function (n) { return n + ' recensioni caricate.'; }, prev:'Recensione precedente', next:'Recensione successiva', reviewWord:'recensioni', position:function (i,n) { return 'Recensione ' + i + ' di ' + n; }, visit:'Visita: ', posted:'Pubblicata ', translated:'Testo tradotto da Google.', reviewLink:'Leggi questa recensione su Google Maps', disclosure:'I commenti scritti sono mostrati secondo la pertinenza stabilita da Google, senza filtri in base alle stelle. Google non verifica le recensioni, ma rimuove i contenuti falsi quando li individua.', policy:'Norme di Google sulle recensioni', all:'Tutte le recensioni', privacy:'Le recensioni vengono caricate da Google solo su tua richiesta.', keyboard:'Usa le frecce sinistra e destra per scorrere le recensioni.', rating:function (v) { return 'Valutazione media Google: ' + v + ' su 5'; }, avatar:'Foto del profilo di '
    },
    pt: {
      title:'Avaliações do Google', intro:'Os comentários públicos são apresentados quando os solicita.', load:'Ver avaliações do Google', loading:'A carregar avaliações do Google…', retry:'Tentar novamente', error:'As avaliações do Google não estão disponíveis neste momento.', empty:'Não há comentários escritos disponíveis neste momento.', loaded:function (n) { return n + ' avaliações carregadas.'; }, prev:'Avaliação anterior', next:'Avaliação seguinte', reviewWord:'avaliações', position:function (i,n) { return 'Avaliação ' + i + ' de ' + n; }, visit:'Visita: ', posted:'Publicada ', translated:'Texto traduzido pelo Google.', reviewLink:'Ler esta avaliação no Google Maps', disclosure:'Os comentários escritos são apresentados por relevância segundo o Google, sem filtro por estrelas. O Google não verifica as avaliações, mas remove conteúdo falso quando o identifica.', policy:'Política de avaliações do Google', all:'Todas as avaliações', privacy:'As avaliações só são carregadas do Google quando o solicita.', keyboard:'Use as setas esquerda e direita para percorrer as avaliações.', rating:function (v) { return 'Classificação média do Google: ' + v + ' em 5'; }, avatar:'Foto de perfil de '
    },
    nl: {
      title:'Google-reviews', intro:'Openbare reacties worden op uw verzoek getoond.', load:'Google-reviews tonen', loading:'Google-reviews laden…', retry:'Opnieuw proberen', error:'Google-reviews zijn momenteel niet beschikbaar.', empty:'Er is momenteel geen geschreven review beschikbaar.', loaded:function (n) { return n + ' reviews geladen.'; }, prev:'Vorige review', next:'Volgende review', reviewWord:'reviews', position:function (i,n) { return 'Review ' + i + ' van ' + n; }, visit:'Bezoek: ', posted:'Geplaatst ', translated:'Door Google vertaald.', reviewLink:'Deze review bekijken op Google Maps', disclosure:'Geschreven reviews worden op relevantie volgens Google getoond, zonder filter op sterren. Google controleert reviews niet, maar verwijdert nepinhoud wanneer die wordt herkend.', policy:'Google-beleid voor reviews', all:'Alle reviews', privacy:'Reviews worden alleen op uw verzoek bij Google opgehaald.', keyboard:'Gebruik de linker- en rechterpijl om door reviews te bladeren.', rating:function (v) { return 'Gemiddelde Google-score: ' + v + ' van de 5'; }, avatar:'Profielfoto van '
    },
    ar: {
      title:'تقييمات Google', intro:'تُعرض التعليقات العامة عند طلبك.', load:'عرض تقييمات Google', loading:'جارٍ تحميل تقييمات Google…', retry:'أعد المحاولة', error:'تقييمات Google غير متاحة الآن.', empty:'لا يتوفر تعليق مكتوب حاليًا.', loaded:function (n) { return 'تم تحميل ' + n + ' من التقييمات.'; }, prev:'التقييم السابق', next:'التقييم التالي', reviewWord:'تقييمات', position:function (i,n) { return 'التقييم ' + i + ' من ' + n; }, visit:'تاريخ الزيارة: ', posted:'نُشر ', translated:'ترجمته Google.', reviewLink:'عرض هذا التقييم على Google Maps', disclosure:'تُعرض التعليقات المكتوبة حسب ترتيب الصلة لدى Google، من دون تصفية حسب التقييم. لا تتحقق Google من التقييمات، لكنها تزيل المحتوى الزائف عند اكتشافه.', policy:'سياسة Google بشأن التقييمات', all:'كل التقييمات', privacy:'لا تُحمّل التقييمات من Google إلا بناءً على طلبك.', keyboard:'استخدم السهمين الأيمن والأيسر لاستعراض التقييمات.', rating:function (v) { return 'متوسط تقييم Google: ' + v + ' من 5'; }, avatar:'صورة الملف الشخصي لـ '
    },
    zh: {
      title:'Google 评价', intro:'根据您的请求显示公开评论。', load:'显示 Google 评价', loading:'正在加载 Google 评价…', retry:'重试', error:'目前无法加载 Google 评价。', empty:'目前没有可显示的文字评论。', loaded:function (n) { return '已加载 ' + n + ' 条评论。'; }, prev:'上一条评论', next:'下一条评论', reviewWord:'条评价', position:function (i,n) { return '第 ' + i + ' 条，共 ' + n + ' 条'; }, visit:'到访时间：', posted:'发布于 ', translated:'由 Google 翻译。', reviewLink:'在 Google Maps 上查看此评论', disclosure:'文字评论按 Google 的相关性顺序显示，不按星级筛选。Google 不会逐条验证评论，但会移除已识别的虚假内容。', policy:'Google 用户内容政策', all:'查看所有评价', privacy:'只有在您请求时才会从 Google 加载评价。', keyboard:'使用左右方向键浏览评论。', rating:function (v) { return 'Google 平均评分：' + v + ' / 5'; }, avatar:'头像：'
    },
    uk: {
      title:'Відгуки Google', intro:'Публічні коментарі показуються на ваш запит.', load:'Показати відгуки Google', loading:'Завантаження відгуків Google…', retry:'Спробувати ще раз', error:'Відгуки Google зараз недоступні.', empty:'Наразі немає доступних письмових відгуків.', loaded:function (n) { return 'Завантажено відгуків: ' + n + '.'; }, prev:'Попередній відгук', next:'Наступний відгук', reviewWord:'відгуків', position:function (i,n) { return 'Відгук ' + i + ' з ' + n; }, visit:'Візит: ', posted:'Опубліковано ', translated:'Перекладено Google.', reviewLink:'Переглянути цей відгук у Google Maps', disclosure:'Письмові відгуки показано за релевантністю Google, без фільтра за кількістю зірок. Google не перевіряє відгуки, але видаляє фальшивий вміст, коли його виявляє.', policy:'Правила Google щодо відгуків', all:'Усі відгуки', privacy:'Відгуки завантажуються з Google лише на ваш запит.', keyboard:'Перегортайте відгуки стрілками ліворуч і праворуч.', rating:function (v) { return 'Середня оцінка Google: ' + v + ' з 5'; }, avatar:'Фото профілю: '
    },
    ja: {
      title:'Google のクチコミ', intro:'公開コメントは、リクエストに応じて表示されます。', load:'Google のクチコミを表示', loading:'Google のクチコミを読み込み中…', retry:'再試行', error:'現在 Google のクチコミを表示できません。', empty:'現在、表示できるテキスト付きのクチコミはありません。', loaded:function (n) { return n + ' 件のクチコミを読み込みました。'; }, prev:'前のクチコミ', next:'次のクチコミ', reviewWord:'件のクチコミ', position:function (i,n) { return n + ' 件中 ' + i + ' 件目'; }, visit:'訪問時期：', posted:'投稿日：', translated:'Google による翻訳です。', reviewLink:'Google Maps でこのクチコミを見る', disclosure:'テキスト付きのクチコミは Google の関連性順に表示され、星の数による絞り込みはありません。Google はクチコミを事前に検証しませんが、偽のコンテンツを特定した場合は削除します。', policy:'Google のクチコミに関するポリシー', all:'すべてのクチコミ', privacy:'クチコミは、お客様のリクエスト後にのみ Google から読み込まれます。', keyboard:'左右の矢印キーでクチコミを切り替えます。', rating:function (v) { return 'Google の平均評価：5 点中 ' + v; }, avatar:'プロフィール写真：'
    },
    ko: {
      title:'Google 리뷰', intro:'공개 댓글은 요청하실 때 표시됩니다.', load:'Google 리뷰 보기', loading:'Google 리뷰를 불러오는 중…', retry:'다시 시도', error:'현재 Google 리뷰를 이용할 수 없습니다.', empty:'현재 표시할 글 리뷰가 없습니다.', loaded:function (n) { return '리뷰 ' + n + '개를 불러왔습니다.'; }, prev:'이전 리뷰', next:'다음 리뷰', reviewWord:'개 리뷰', position:function (i,n) { return n + '개 중 ' + i + '번째 리뷰'; }, visit:'방문 시기: ', posted:'게시일 ', translated:'Google 번역본입니다.', reviewLink:'Google Maps에서 이 리뷰 보기', disclosure:'작성된 리뷰는 Google의 관련성 순으로 표시되며 별점으로 필터링하지 않습니다. Google은 리뷰를 사전 검증하지 않지만 허위 콘텐츠를 발견하면 삭제합니다.', policy:'Google 리뷰 정책', all:'모든 리뷰', privacy:'요청하신 경우에만 Google에서 리뷰를 불러옵니다.', keyboard:'왼쪽 및 오른쪽 화살표 키로 리뷰를 둘러보세요.', rating:function (v) { return 'Google 평균 평점: 5점 만점에 ' + v; }, avatar:'프로필 사진: '
    },
    pl: {
      title:'Opinie Google', intro:'Publiczne komentarze są wyświetlane na Twoje żądanie.', load:'Pokaż opinie Google', loading:'Wczytywanie opinii Google…', retry:'Spróbuj ponownie', error:'Opinie Google są teraz niedostępne.', empty:'Obecnie nie ma dostępnej opinii tekstowej.', loaded:function (n) { return 'Wczytano opinii: ' + n + '.'; }, prev:'Poprzednia opinia', next:'Następna opinia', reviewWord:'opinii', position:function (i,n) { return 'Opinia ' + i + ' z ' + n; }, visit:'Wizyta: ', posted:'Opublikowano ', translated:'Tekst przetłumaczony przez Google.', reviewLink:'Zobacz tę opinię w Google Maps', disclosure:'Opinie tekstowe są wyświetlane według trafności ustalonej przez Google, bez filtrowania według liczby gwiazdek. Google nie weryfikuje opinii, ale usuwa wykryte fałszywe treści.', policy:'Zasady Google dotyczące opinii', all:'Wszystkie opinie', privacy:'Opinie są pobierane z Google dopiero na Twoje żądanie.', keyboard:'Użyj strzałek w lewo i w prawo, aby przeglądać opinie.', rating:function (v) { return 'Średnia ocena Google: ' + v + ' na 5'; }, avatar:'Zdjęcie profilowe: '
    },
    tr: {
      title:'Google yorumları', intro:'Herkese açık yorumlar isteğiniz üzerine gösterilir.', load:'Google yorumlarını göster', loading:'Google yorumları yükleniyor…', retry:'Tekrar dene', error:'Google yorumları şu anda kullanılamıyor.', empty:'Şu anda gösterilebilecek yazılı bir yorum yok.', loaded:function (n) { return n + ' yorum yüklendi.'; }, prev:'Önceki yorum', next:'Sonraki yorum', reviewWord:'yorum', position:function (i,n) { return n + ' yorumdan ' + i + '. yorum'; }, visit:'Ziyaret: ', posted:'Yayınlanma ', translated:'Google tarafından çevrildi.', reviewLink:'Bu yorumu Google Maps’te görüntüle', disclosure:'Yazılı yorumlar Google’ın alaka düzeyine göre sıralanır; yıldız puanına göre filtrelenmez. Google yorumları doğrulamaz ancak tespit ettiği sahte içerikleri kaldırır.', policy:'Google yorum politikası', all:'Tüm yorumlar', privacy:'Yorumlar yalnızca isteğiniz üzerine Google’dan yüklenir.', keyboard:'Yorumlar arasında gezinmek için sol ve sağ ok tuşlarını kullanın.', rating:function (v) { return 'Google ortalama puanı: 5 üzerinden ' + v; }, avatar:'Profil fotoğrafı: '
    },
    hi: {
      title:'Google समीक्षाएँ', intro:'सार्वजनिक टिप्पणियाँ आपके अनुरोध पर दिखाई जाती हैं।', load:'Google समीक्षाएँ दिखाएँ', loading:'Google समीक्षाएँ लोड हो रही हैं…', retry:'फिर से कोशिश करें', error:'अभी Google समीक्षाएँ उपलब्ध नहीं हैं।', empty:'अभी कोई लिखित टिप्पणी उपलब्ध नहीं है।', loaded:function (n) { return n + ' समीक्षाएँ लोड हुईं।'; }, prev:'पिछली समीक्षा', next:'अगली समीक्षा', reviewWord:'समीक्षाएँ', position:function (i,n) { return n + ' में से ' + i + 'वीं समीक्षा'; }, visit:'भेंट: ', posted:'प्रकाशित ', translated:'Google द्वारा अनुवादित।', reviewLink:'Google Maps पर यह समीक्षा देखें', disclosure:'लिखित समीक्षाएँ Google की प्रासंगिकता के क्रम में दिखाई जाती हैं; सितारों के आधार पर कोई फ़िल्टर नहीं है। Google समीक्षाओं का सत्यापन नहीं करता, लेकिन पहचानी गई नकली सामग्री हटा देता है।', policy:'Google की समीक्षा नीति', all:'सभी समीक्षाएँ', privacy:'समीक्षाएँ केवल आपके अनुरोध पर Google से लोड होती हैं।', keyboard:'समीक्षाएँ देखने के लिए बाएँ और दाएँ तीर कुंजियों का उपयोग करें।', rating:function (v) { return 'Google की औसत रेटिंग: 5 में से ' + v; }, avatar:'प्रोफ़ाइल फ़ोटो: '
    }
  };

  var LOCALES = { fr:'fr-FR', en:'en-GB', es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT', nl:'nl-NL', ar:'ar', zh:'zh-CN', uk:'uk-UA', ja:'ja-JP', ko:'ko-KR', pl:'pl-PL', tr:'tr-TR', hi:'hi-IN' };
  var CAROUSEL_LABELS = { fr:'carrousel', en:'carousel', es:'carrusel', de:'Karussell', it:'carosello', pt:'carrossel', nl:'carrousel', ar:'عرض دوّار', zh:'轮播', uk:'карусель', ja:'カルーセル', ko:'캐러셀', pl:'karuzela', tr:'kaydırmalı liste', hi:'कैरोसेल' };
  var MAP_DATA_LABELS = { fr:'Données cartographiques : ', en:'Map data: ', es:'Datos del mapa: ', de:'Kartendaten: ', it:'Dati cartografici: ', pt:'Dados do mapa: ', nl:'Kaartgegevens: ', ar:'بيانات الخريطة: ', zh:'地图数据：', uk:'Дані карти: ', ja:'地図データ：', ko:'지도 데이터: ', pl:'Dane mapy: ', tr:'Harita verileri: ', hi:'मानचित्र डेटा: ' };
  var state = 'idle';
  var reviews = [];
  var current = 0;
  var placeUrl = allReviews.href;
  var place = null;
  var sdkPromise = null;
  var requestPromise = null;
  var pointerStart = null;

  function lang() {
    var value = String(document.documentElement.lang || 'fr').toLowerCase().split('-')[0];
    return COPY[value] ? value : 'fr';
  }
  function copy() { return COPY[lang()]; }
  function locale() { return LOCALES[lang()] || 'fr-FR'; }
  function number(value, options) {
    try { return new Intl.NumberFormat(locale(), options || {}).format(value); }
    catch (error) { return String(value); }
  }
  function safeUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(String(value), window.location.href);
      return url.protocol === 'https:' ? url.href : '';
    } catch (error) { return ''; }
  }
  function localisedText(value) {
    if (typeof value === 'string') return value;
    return value && typeof value.text === 'string' ? value.text : '';
  }
  function setStatus() {
    var c = copy();
    if (state === 'loading') status.textContent = c.loading;
    else if (state === 'error') status.textContent = c.error;
    else if (state === 'empty') status.textContent = c.empty;
    else if (state === 'loaded') status.textContent = c.loaded(reviews.length);
    else status.textContent = '';
  }
  function applyLanguage() {
    var c = copy();
    section.setAttribute('aria-label', c.title);
    title.textContent = c.title;
    intro.textContent = c.intro;
    intro.hidden = state === 'loaded' || state === 'empty';
    loadButton.textContent = state === 'loading' ? c.loading : (state === 'error' ? c.retry : c.load);
    loadButton.hidden = state === 'loaded' || state === 'empty';
    loadButton.disabled = state === 'loading';
    loadButton.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    loadButton.setAttribute('aria-label', state === 'error' ? c.retry : c.load);
    privacyHint.textContent = c.privacy;
    privacyHint.hidden = state === 'loaded' || state === 'empty';
    previous.setAttribute('aria-label', c.prev);
    next.setAttribute('aria-label', c.next);
    carousel.setAttribute('aria-label', c.title);
    carousel.setAttribute('aria-roledescription', CAROUSEL_LABELS[lang()] || 'carousel');
    viewport.setAttribute('aria-roledescription', CAROUSEL_LABELS[lang()] || 'carousel');
    viewport.setAttribute('aria-label', c.keyboard);
    dots.setAttribute('aria-label', c.title);
    disclosureText.textContent = c.disclosure;
    policy.textContent = c.policy;
    allReviews.textContent = c.all;
    setStatus();
    if (place) renderSummary(place);
    if (reviews.length) renderSlide(0);
  }
  function visitDate(review) {
    var year = Number(review.visitDateYear || (review.visitDate && review.visitDate.year) || 0);
    var month = review.visitDateMonth;
    if (month === undefined || month === null || month === '') {
      var date = review.visitDate;
      month = date && date.month !== undefined ? Number(date.month) - 1 : NaN;
    } else {
      month = Number(month); // Places JavaScript API uses zero-based months.
    }
    if (!year || !Number.isFinite(month) || month < 0 || month > 11) return '';
    try {
      return new Intl.DateTimeFormat(locale(), { month:'long', year:'numeric', timeZone:'UTC' })
        .format(new Date(Date.UTC(year, month, 1)));
    } catch (error) { return ''; }
  }
  function publishedDate(review) {
    var relative = String(review.relativePublishTimeDescription || '').trim();
    if (relative) return relative;
    if (!review.publishTime) return '';
    var date = new Date(review.publishTime);
    if (!Number.isFinite(date.getTime())) return '';
    try { return new Intl.DateTimeFormat(locale(), { month:'short', year:'numeric', timeZone:'UTC' }).format(date); }
    catch (error) { return ''; }
  }
  function normalizeReview(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var author = raw.authorAttribution || {};
    var authorName = String(author.displayName || '').trim();
    var text = localisedText(raw.text) || localisedText(raw.originalText);
    text = String(text || '').replace(/\s+/g, ' ').trim();
    var reviewUrl = safeUrl(raw.googleMapsURI || raw.googleMapsUri);
    var rating = Number(raw.rating);
    if (!authorName || !text || !reviewUrl) return null;
    return {
      author: authorName,
      authorUrl: safeUrl(author.uri),
      photoUrl: safeUrl(author.photoURI || author.photoUri),
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
      text: text,
      textLanguage: String(raw.textLanguageCode || raw.originalTextLanguageCode || lang()),
      translated: !!(raw.textLanguageCode && raw.originalTextLanguageCode &&
        String(raw.textLanguageCode).toLowerCase() !== String(raw.originalTextLanguageCode).toLowerCase()),
      reviewUrl: reviewUrl,
      visit: visitDate(raw),
      published: publishedDate(raw)
    };
  }
  function setPlaceLinks(url) {
    var trusted = safeUrl(url) || placeUrl;
    if (!trusted) return;
    placeUrl = trusted;
    allReviews.href = trusted;
    mapsAttribution.href = trusted;
  }
  function renderSummary(value) {
    var rating = Number(value.rating);
    var total = Number(value.userRatingCount);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) return;
    var formatted = number(rating, { minimumFractionDigits:1, maximumFractionDigits:1 });
    score.textContent = formatted + '/5';
    count.textContent = Number.isFinite(total) && total > 0
      ? number(total) + ' ' + copy().reviewWord
      : '';
    count.hidden = !(Number.isFinite(total) && total > 0);
    starsFill.style.width = (Math.max(0, Math.min(5, rating)) / 5 * 100).toFixed(1) + '%';
    stars.setAttribute('aria-label', copy().rating(formatted));
    summary.hidden = false;
  }
  function makeAuthor(review) {
    var wrap = document.createElement('span');
    wrap.className = 'google-reviews-author-wrap';
    if (review.photoUrl) {
      var photo = document.createElement('img');
      photo.className = 'google-reviews-avatar';
      photo.width = 32;
      photo.height = 32;
      photo.loading = 'lazy';
      photo.decoding = 'async';
      photo.alt = copy().avatar + review.author;
      photo.src = review.photoUrl;
      photo.addEventListener('error', function () {
        photo.hidden = true;
        photo.removeAttribute('src');
        photo.alt = '';
      }, { once:true });
      wrap.appendChild(photo);
    }
    var name = document.createElement(review.authorUrl ? 'a' : 'span');
    name.className = 'google-reviews-author';
    name.textContent = review.author;
    if (review.authorUrl) {
      name.href = review.authorUrl;
      name.target = '_blank';
      name.rel = 'noopener noreferrer';
    }
    name.setAttribute('translate', 'no');
    name.setAttribute('lang', review.textLanguage || lang());
    wrap.appendChild(name);
    return wrap;
  }
  function renderSlide(direction) {
    if (!reviews.length) return;
    var c = copy();
    var review = reviews[current];
    var article = document.createElement('article');
    article.className = 'google-reviews-slide';
    article.setAttribute('role', 'group');
    article.setAttribute('aria-roledescription', c.position(current + 1, reviews.length));
    article.setAttribute('aria-label', c.position(current + 1, reviews.length));
    article.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');

    if (review.rating !== null) {
      var ratingLine = document.createElement('p');
      ratingLine.className = 'google-reviews-review-rating';
      var ratingStars = document.createElement('span');
      ratingStars.className = 'google-reviews-review-stars';
      ratingStars.textContent = '★'.repeat(Math.round(review.rating)) + '☆'.repeat(5 - Math.round(review.rating));
      ratingStars.setAttribute('aria-hidden', 'true');
      var ratingText = document.createElement('span');
      ratingText.textContent = number(review.rating, { minimumFractionDigits:0, maximumFractionDigits:1 }) + '/5';
      ratingLine.appendChild(ratingStars);
      ratingLine.appendChild(ratingText);
      article.appendChild(ratingLine);
    }

    var quote = document.createElement('blockquote');
    quote.className = 'google-reviews-quote';
    quote.textContent = review.text;
    quote.setAttribute('translate', 'no');
    quote.setAttribute('lang', review.textLanguage || lang());
    quote.setAttribute('dir', /^ar(?:-|$)/i.test(review.textLanguage) ? 'rtl' : 'ltr');
    article.appendChild(quote);

    var meta = document.createElement('div');
    meta.className = 'google-reviews-meta';
    meta.appendChild(makeAuthor(review));
    if (review.visit) {
      var visit = document.createElement('span');
      visit.className = 'google-reviews-date';
      visit.textContent = copy().visit + review.visit;
      meta.appendChild(visit);
    }
    if (review.published) {
      var published = document.createElement('span');
      published.className = 'google-reviews-date';
      published.textContent = copy().posted + review.published;
      meta.appendChild(published);
    }
    article.appendChild(meta);

    if (review.translated) {
      var translated = document.createElement('p');
      translated.className = 'google-reviews-translated';
      translated.textContent = c.translated;
      translated.setAttribute('translate', 'no');
      translated.style.margin = '9px 0 0';
      translated.style.fontSize = '.7rem';
      article.appendChild(translated);
    }

    var source = document.createElement('a');
    source.className = 'google-reviews-source';
    source.href = review.reviewUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = c.reviewLink;
    article.appendChild(source);

    article.classList.add(direction < 0 ? 'is-entering-previous' : 'is-entering-next');
    slide.replaceChildren(article);
    status.textContent = c.position(current + 1, reviews.length);
    Array.prototype.forEach.call(dots.children, function (dot, index) {
      dot.setAttribute('aria-current', index === current ? 'true' : 'false');
      dot.setAttribute('aria-label', c.position(index + 1, reviews.length));
    });
  }
  function goTo(index, direction) {
    if (!reviews.length) return;
    var total = reviews.length;
    current = (index + total) % total;
    renderSlide(direction || 1);
  }
  function renderCarousel(items) {
    reviews = items.map(normalizeReview).filter(Boolean);
    current = 0;
    disclosure.hidden = false;
    if (!reviews.length) {
      carousel.hidden = true;
      dots.hidden = true;
      previous.hidden = true;
      next.hidden = true;
      state = 'empty';
      loadButton.hidden = true;
      loadButton.disabled = false;
      loadButton.setAttribute('aria-busy', 'false');
      privacyHint.hidden = true;
      intro.hidden = true;
      setStatus();
      return;
    }
    carousel.hidden = false;
    var multiple = reviews.length > 1;
    previous.hidden = !multiple;
    next.hidden = !multiple;
    dots.hidden = !multiple;
    dots.replaceChildren();
    if (multiple) {
      reviews.forEach(function (_review, index) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'google-reviews-dot';
        dot.setAttribute('aria-current', index === 0 ? 'true' : 'false');
        dot.setAttribute('aria-label', copy().position(index + 1, reviews.length));
        dot.addEventListener('click', function () { goTo(index, index >= current ? 1 : -1); });
        dots.appendChild(dot);
      });
    }
    state = 'loaded';
    loadButton.hidden = true;
    loadButton.disabled = false;
    loadButton.setAttribute('aria-busy', 'false');
    privacyHint.hidden = true;
    intro.hidden = true;
    setStatus();
    renderSlide(1);
  }
  function renderAttributions(items) {
    attributions.replaceChildren();
    var usable = Array.isArray(items) ? items.filter(function (item) {
      return item && String(item.provider || '').trim();
    }) : [];
    usable.forEach(function (item, index) {
      if (index) attributions.appendChild(document.createTextNode(' · '));
      if (!index) attributions.appendChild(document.createTextNode(MAP_DATA_LABELS[lang()] || MAP_DATA_LABELS.fr));
      var label = String(item.provider).trim();
      var url = safeUrl(item.providerURI || item.providerUri);
      if (url) {
        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        attributions.appendChild(link);
      } else {
        attributions.appendChild(document.createTextNode(label));
      }
    });
    attributions.hidden = usable.length === 0;
  }
  function loadMapsLibrary(key, language) {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      function importPlaces() {
        var maps = window.google && window.google.maps;
        if (!maps || typeof maps.importLibrary !== 'function') return false;
        try {
          Promise.resolve(maps.importLibrary('places')).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
        return true;
      }
      if (importPlaces()) return;

      var script = document.createElement('script');
      script.async = true;
      script.dataset.googleReviewsSdk = 'true';
      var params = new URLSearchParams({ key:key, v:'weekly', loading:'async', language:language, region:'FR' });
      script.src = 'https://maps.googleapis.com/maps/api/js?' + params.toString();
      script.onload = function () {
        if (!importPlaces()) reject(new Error('sdk'));
      };
      script.onerror = function () { reject(new Error('network')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      sdkPromise = null;
      throw error;
    });
    return sdkPromise;
  }
  function fetchConfiguration() {
    return fetch('assets/data/avis-google.json', { cache:'no-store', credentials:'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('config');
        return response.json();
      })
      .then(function (data) {
        if (!data || !String(data.place_id || '').trim() || !String(data.cle_api || '').trim()) {
          throw new Error('config');
        }
        return data;
      });
  }
  function loadReviews() {
    if (requestPromise) return requestPromise;
    if (state === 'loaded' || state === 'empty') return Promise.resolve();
    state = 'loading';
    loadButton.disabled = true;
    loadButton.setAttribute('aria-busy', 'true');
    loadButton.textContent = copy().loading;
    setStatus();
    requestPromise = Promise.resolve()
      .then(fetchConfiguration)
      .then(function (config) {
        return loadMapsLibrary(config.cle_api, lang()).then(function (library) {
          if (!library || !library.Place) throw new Error('places');
          var target = new library.Place({ id:config.place_id });
          return target.fetchFields({
            fields:['rating','userRatingCount','googleMapsURI','reviews','attributions']
          }).then(function () {
            place = target;
            setPlaceLinks(target.googleMapsURI || config.url || placeUrl);
            renderSummary(target);
            renderAttributions(target.attributions);
            renderCarousel(Array.isArray(target.reviews) ? target.reviews : []);
            if (document.activeElement === loadButton) {
              var focusTarget = reviews.length > 1 ? previous : viewport;
              focusTarget.focus({ preventScroll:true });
            }
          });
        });
      })
      .catch(function () {
        state = 'error';
        intro.hidden = false;
        privacyHint.hidden = false;
        loadButton.hidden = false;
        applyLanguage();
      })
      .then(function (result) {
        requestPromise = null;
        return result;
      }, function (error) {
        requestPromise = null;
        throw error;
      });
    return requestPromise;
  }

  previous.addEventListener('click', function () { goTo(current - 1, -1); });
  next.addEventListener('click', function () { goTo(current + 1, 1); });
  loadButton.addEventListener('click', loadReviews);
  viewport.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current + (document.documentElement.dir === 'rtl' ? 1 : -1), -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(current + (document.documentElement.dir === 'rtl' ? -1 : 1), 1);
    }
  });
  viewport.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse') return;
    pointerStart = { x:event.clientX, y:event.clientY };
  }, { passive:true });
  viewport.addEventListener('pointerup', function (event) {
    if (!pointerStart) return;
    var dx = pointerStart.x - event.clientX;
    var dy = pointerStart.y - event.clientY;
    pointerStart = null;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
    var forward = dx > 0;
    if (document.documentElement.dir === 'rtl') forward = !forward;
    goTo(current + (forward ? 1 : -1), forward ? 1 : -1);
  }, { passive:true });
  viewport.addEventListener('pointercancel', function () { pointerStart = null; }, { passive:true });

  window.addEventListener('lcg-lang-changed', applyLanguage);
  window.addEventListener('lcg-i18n-ready', applyLanguage);
  applyLanguage();
})();
