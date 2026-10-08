(function () {
  'use strict';

  var COPIES = {
    fr: {
      title: 'Bonjour RATP n’a pas pu s’ouvrir',
      intro: 'Préparez un itinéraire RATP vers La Colline Gambetta, 4 Rue Belgrand, 75020 Paris, à partir de votre position ou d’un départ saisi manuellement.',
      privacy: 'La position n’est demandée qu’après votre action et avec l’autorisation du navigateur. Si vous l’autorisez, ses coordonnées sont envoyées à api-adresse.data.gouv.fr pour être converties en adresse ; l’itinéraire transmis à RATP contient cette adresse, pas vos coordonnées. Vous pouvez refuser et saisir un départ.',
      initial: 'Choisissez votre point de départ.', requesting: 'Demande d’accès à la position…',
      useLocation: 'Utiliser ma position', retry: 'Réessayer avec ma position',
      locationError: 'Position refusée ou indisponible. Saisissez un départ ou continuez sans position.',
      addressError: 'Votre position n’a pas pu être convertie en adresse. Saisissez un départ ou continuez sans position.',
      opening: 'Ouverture de l’itinéraire RATP…', departureLabel: 'Départ (adresse ou station)',
      placeholder: 'Saisir une adresse ou une station', openManual: 'Ouvrir l’itinéraire RATP',
      continueWithout: 'Continuer sans position sur RATP', back: 'Retour à La Colline Gambetta',
      privacyLink: 'Confidentialité'
    },
    en: {
      title: 'Bonjour RATP could not be opened',
      intro: 'Plan a RATP journey to La Colline Gambetta, 4 Rue Belgrand, 75020 Paris, using your location or a departure you enter.',
      privacy: 'Your location is requested only after your action and with your browser’s permission. If allowed, its coordinates are sent to api-adresse.data.gouv.fr to convert them to an address; RATP receives that address, not your coordinates. You can decline and enter a departure instead.',
      initial: 'Choose how to set your departure.', requesting: 'Requesting access to your location…',
      useLocation: 'Use my location', retry: 'Try my location again',
      locationError: 'Location was denied or is unavailable. Enter a departure or continue without location.',
      addressError: 'Your location could not be converted to an address. Enter a departure or continue without location.',
      opening: 'Opening the RATP journey…', departureLabel: 'Departure (address or station)',
      placeholder: 'Enter an address or station', openManual: 'Open the RATP journey',
      continueWithout: 'Continue on RATP without location', back: 'Back to La Colline Gambetta',
      privacyLink: 'Privacy'
    },
    es: {
      title: 'No se pudo abrir Bonjour RATP',
      intro: 'Prepara una ruta de RATP hasta La Colline Gambetta, 4 Rue Belgrand, 75020 París, usando tu ubicación o escribiendo el punto de salida.',
      privacy: 'La ubicación solo se solicita después de tu acción y con permiso del navegador. Si la autorizas, las coordenadas se envían a api-adresse.data.gouv.fr para convertirlas en una dirección; RATP recibe esa dirección, no tus coordenadas. Puedes rechazarlo y escribir un punto de salida.',
      initial: 'Elige cómo indicar el punto de salida.', requesting: 'Solicitando acceso a tu ubicación…',
      useLocation: 'Usar mi ubicación', retry: 'Volver a intentar con mi ubicación',
      locationError: 'Se rechazó la ubicación o no está disponible. Escribe un punto de salida o continúa sin ubicación.',
      addressError: 'No se pudo convertir tu ubicación en una dirección. Escribe un punto de salida o continúa sin ubicación.',
      opening: 'Abriendo la ruta de RATP…', departureLabel: 'Salida (dirección o estación)',
      placeholder: 'Escribe una dirección o estación', openManual: 'Abrir la ruta de RATP',
      continueWithout: 'Continuar en RATP sin ubicación', back: 'Volver a La Colline Gambetta',
      privacyLink: 'Privacidad'
    },
    de: {
      title: 'Bonjour RATP konnte nicht geöffnet werden',
      intro: 'Plane eine RATP-Fahrt zur La Colline Gambetta, 4 Rue Belgrand, 75020 Paris, mit deinem Standort oder einer manuell eingegebenen Abfahrt.',
      privacy: 'Dein Standort wird erst nach deiner Aktion und mit der Zustimmung deines Browsers abgefragt. Wenn du zustimmst, werden die Koordinaten zur Umwandlung in eine Adresse an api-adresse.data.gouv.fr gesendet; RATP erhält diese Adresse, nicht deine Koordinaten. Du kannst ablehnen und eine Abfahrt eingeben.',
      initial: 'Wähle deinen Abfahrtsort.', requesting: 'Standortzugriff wird angefragt…',
      useLocation: 'Meinen Standort verwenden', retry: 'Standort erneut abrufen',
      locationError: 'Der Standort wurde abgelehnt oder ist nicht verfügbar. Gib einen Abfahrtsort ein oder fahre ohne Standort fort.',
      addressError: 'Dein Standort konnte nicht in eine Adresse umgewandelt werden. Gib einen Abfahrtsort ein oder fahre ohne Standort fort.',
      opening: 'RATP-Verbindung wird geöffnet…', departureLabel: 'Abfahrt (Adresse oder Station)',
      placeholder: 'Adresse oder Station eingeben', openManual: 'RATP-Verbindung öffnen',
      continueWithout: 'Ohne Standort auf RATP fortfahren', back: 'Zurück zu La Colline Gambetta',
      privacyLink: 'Datenschutz'
    },
    it: {
      title: 'Impossibile aprire Bonjour RATP',
      intro: 'Prepara un itinerario RATP per La Colline Gambetta, 4 Rue Belgrand, 75020 Parigi, usando la tua posizione o inserendo manualmente la partenza.',
      privacy: 'La posizione viene richiesta solo dopo una tua azione e con il consenso del browser. Se autorizzi la richiesta, le coordinate vengono inviate a api-adresse.data.gouv.fr per convertirle in un indirizzo; a RATP viene trasmesso l’indirizzo, non le coordinate. Puoi rifiutare e inserire una partenza.',
      initial: 'Scegli come indicare la partenza.', requesting: 'Richiesta di accesso alla posizione…',
      useLocation: 'Usa la mia posizione', retry: 'Riprova con la mia posizione',
      locationError: 'Posizione negata o non disponibile. Inserisci una partenza o continua senza posizione.',
      addressError: 'Impossibile convertire la posizione in un indirizzo. Inserisci una partenza o continua senza posizione.',
      opening: 'Apertura dell’itinerario RATP…', departureLabel: 'Partenza (indirizzo o stazione)',
      placeholder: 'Inserisci un indirizzo o una stazione', openManual: 'Apri l’itinerario RATP',
      continueWithout: 'Continua su RATP senza posizione', back: 'Torna a La Colline Gambetta',
      privacyLink: 'Privacy'
    },
    pt: {
      title: 'Não foi possível abrir o Bonjour RATP',
      intro: 'Prepare um trajeto da RATP até La Colline Gambetta, 4 Rue Belgrand, 75020 Paris, usando a sua localização ou indicando o ponto de partida.',
      privacy: 'A localização só é solicitada após a sua ação e com a autorização do navegador. Se autorizar, as coordenadas são enviadas a api-adresse.data.gouv.fr para serem convertidas num endereço; a RATP recebe esse endereço, não as coordenadas. Pode recusar e indicar um ponto de partida.',
      initial: 'Escolha como definir o ponto de partida.', requesting: 'A pedir acesso à localização…',
      useLocation: 'Usar a minha localização', retry: 'Tentar novamente a localização',
      locationError: 'A localização foi recusada ou não está disponível. Indique um ponto de partida ou continue sem localização.',
      addressError: 'Não foi possível converter a localização num endereço. Indique um ponto de partida ou continue sem localização.',
      opening: 'A abrir o trajeto da RATP…', departureLabel: 'Partida (endereço ou estação)',
      placeholder: 'Introduza um endereço ou uma estação', openManual: 'Abrir o trajeto da RATP',
      continueWithout: 'Continuar na RATP sem localização', back: 'Voltar a La Colline Gambetta',
      privacyLink: 'Privacidade'
    },
    nl: {
      title: 'Bonjour RATP kon niet worden geopend',
      intro: 'Plan een RATP-route naar La Colline Gambetta, 4 Rue Belgrand, 75020 Parijs, met je locatie of een vertrekpunt dat je zelf invult.',
      privacy: 'Je locatie wordt pas opgevraagd nadat je dit kiest en met toestemming van je browser. Als je toestemming geeft, worden de coördinaten naar api-adresse.data.gouv.fr gestuurd om ze om te zetten in een adres; RATP ontvangt dat adres, niet je coördinaten. Je kunt weigeren en zelf een vertrekpunt invullen.',
      initial: 'Kies hoe je het vertrekpunt wilt instellen.', requesting: 'Toegang tot je locatie wordt aangevraagd…',
      useLocation: 'Mijn locatie gebruiken', retry: 'Locatie opnieuw proberen',
      locationError: 'Locatie is geweigerd of niet beschikbaar. Vul een vertrekpunt in of ga verder zonder locatie.',
      addressError: 'Je locatie kon niet worden omgezet in een adres. Vul een vertrekpunt in of ga verder zonder locatie.',
      opening: 'RATP-route wordt geopend…', departureLabel: 'Vertrek (adres of station)',
      placeholder: 'Vul een adres of station in', openManual: 'RATP-route openen',
      continueWithout: 'Verder op RATP zonder locatie', back: 'Terug naar La Colline Gambetta',
      privacyLink: 'Privacy'
    },
    pl: {
      title: 'Nie udało się otworzyć Bonjour RATP',
      intro: 'Wyznacz trasę RATP do La Colline Gambetta, 4 Rue Belgrand, 75020 Paryż, korzystając ze swojej lokalizacji lub wpisując punkt początkowy.',
      privacy: 'Lokalizacja jest pobierana dopiero po Twoim działaniu i za zgodą przeglądarki. Jeśli ją wyrazisz, współrzędne zostaną wysłane do api-adresse.data.gouv.fr w celu zamiany na adres; do RATP trafi adres, a nie współrzędne. Możesz odmówić i wpisać punkt początkowy.',
      initial: 'Wybierz sposób ustawienia punktu początkowego.', requesting: 'Prośba o dostęp do lokalizacji…',
      useLocation: 'Użyj mojej lokalizacji', retry: 'Spróbuj ponownie użyć lokalizacji',
      locationError: 'Odmówiono dostępu do lokalizacji lub jest ona niedostępna. Wpisz punkt początkowy albo kontynuuj bez lokalizacji.',
      addressError: 'Nie udało się zamienić lokalizacji na adres. Wpisz punkt początkowy albo kontynuuj bez lokalizacji.',
      opening: 'Otwieranie trasy RATP…', departureLabel: 'Początek (adres lub stacja)',
      placeholder: 'Wpisz adres lub stację', openManual: 'Otwórz trasę RATP',
      continueWithout: 'Kontynuuj w RATP bez lokalizacji', back: 'Wróć do La Colline Gambetta',
      privacyLink: 'Prywatność'
    },
    zh: {
      title: '无法打开 Bonjour RATP',
      intro: '使用您的位置或手动输入出发地，规划前往 La Colline Gambetta（4 Rue Belgrand, 75020 Paris）的 RATP 行程。',
      privacy: '只有在您操作并获得浏览器授权后，页面才会请求位置信息。若您同意，坐标会发送至 api-adresse.data.gouv.fr 转换为地址；发送给 RATP 的是地址，而非坐标。您也可以拒绝并手动输入出发地。',
      initial: '请选择如何设置出发地。', requesting: '正在请求位置权限…',
      useLocation: '使用我的位置', retry: '重新尝试获取位置',
      locationError: '位置请求被拒绝或不可用。请输入出发地，或在不使用位置的情况下继续。',
      addressError: '无法将您的位置转换为地址。请输入出发地，或在不使用位置的情况下继续。',
      opening: '正在打开 RATP 行程…', departureLabel: '出发地（地址或车站）',
      placeholder: '输入地址或车站', openManual: '打开 RATP 行程',
      continueWithout: '不使用位置，继续前往 RATP', back: '返回 La Colline Gambetta',
      privacyLink: '隐私'
    },
    uk: {
      title: 'Не вдалося відкрити Bonjour RATP',
      intro: 'Побудуйте маршрут RATP до La Colline Gambetta, 4 Rue Belgrand, 75020 Париж, використавши своє місцезнаходження або ввівши пункт відправлення.',
      privacy: 'Місцезнаходження запитується лише після вашої дії та з дозволу браузера. Якщо ви дозволите доступ, координати буде надіслано до api-adresse.data.gouv.fr для перетворення на адресу; RATP отримає адресу, а не координати. Ви можете відмовити й ввести пункт відправлення.',
      initial: 'Виберіть спосіб указати пункт відправлення.', requesting: 'Запит дозволу на доступ до місцезнаходження…',
      useLocation: 'Використати моє місцезнаходження', retry: 'Спробувати визначити місцезнаходження ще раз',
      locationError: 'Доступ до місцезнаходження відхилено або воно недоступне. Введіть пункт відправлення або продовжте без нього.',
      addressError: 'Не вдалося перетворити місцезнаходження на адресу. Введіть пункт відправлення або продовжте без нього.',
      opening: 'Відкриваємо маршрут RATP…', departureLabel: 'Відправлення (адреса або станція)',
      placeholder: 'Введіть адресу або станцію', openManual: 'Відкрити маршрут RATP',
      continueWithout: 'Продовжити на RATP без місцезнаходження', back: 'Назад до La Colline Gambetta',
      privacyLink: 'Конфіденційність'
    },
    ja: {
      title: 'Bonjour RATPを開けませんでした',
      intro: '現在地を使うか出発地を入力して、La Colline Gambetta（4 Rue Belgrand, 75020 Paris）までのRATPルートを検索できます。',
      privacy: '位置情報は、お客様の操作後にブラウザーの許可を得てから取得します。許可された場合、座標は住所への変換のため api-adresse.data.gouv.fr に送信されます。RATPに送信されるのは住所であり、座標ではありません。許可せずに出発地を入力することもできます。',
      initial: '出発地の指定方法を選んでください。', requesting: '位置情報の許可を確認しています…',
      useLocation: '現在地を使う', retry: '位置情報を再取得',
      locationError: '位置情報が拒否されたか、利用できません。出発地を入力するか、位置情報を使わずに続けてください。',
      addressError: '現在地を住所に変換できませんでした。出発地を入力するか、位置情報を使わずに続けてください。',
      opening: 'RATPのルートを開いています…', departureLabel: '出発地（住所または駅）',
      placeholder: '住所または駅を入力', openManual: 'RATPのルートを開く',
      continueWithout: '位置情報を使わずRATPを開く', back: 'La Colline Gambettaに戻る',
      privacyLink: 'プライバシー'
    },
    ko: {
      title: 'Bonjour RATP를 열 수 없습니다',
      intro: '현재 위치를 사용하거나 출발지를 입력해 La Colline Gambetta(4 Rue Belgrand, 75020 Paris)까지 가는 RATP 경로를 찾으세요.',
      privacy: '위치 정보는 사용자의 동작 후 브라우저 권한을 받아 요청합니다. 허용하면 좌표를 주소로 변환하기 위해 api-adresse.data.gouv.fr로 전송합니다. RATP에는 좌표가 아니라 변환된 주소가 전달됩니다. 거부하고 출발지를 직접 입력할 수 있습니다.',
      initial: '출발지를 설정하는 방법을 선택하세요.', requesting: '위치 정보 권한을 요청하는 중…',
      useLocation: '내 위치 사용', retry: '위치 정보 다시 시도',
      locationError: '위치 정보가 거부되었거나 사용할 수 없습니다. 출발지를 입력하거나 위치 정보 없이 계속하세요.',
      addressError: '위치 정보를 주소로 변환할 수 없습니다. 출발지를 입력하거나 위치 정보 없이 계속하세요.',
      opening: 'RATP 경로를 여는 중…', departureLabel: '출발지 (주소 또는 역)',
      placeholder: '주소 또는 역 입력', openManual: 'RATP 경로 열기',
      continueWithout: '위치 정보 없이 RATP에서 계속', back: 'La Colline Gambetta로 돌아가기',
      privacyLink: '개인정보 보호'
    },
    ar: {
      title: 'تعذّر فتح Bonjour RATP',
      intro: 'خطّط لرحلة عبر RATP إلى La Colline Gambetta، 4 Rue Belgrand، 75020 Paris، باستخدام موقعك أو بإدخال نقطة الانطلاق.',
      privacy: 'لا يُطلب الموقع إلا بعد تفاعلك وبموافقة المتصفح. إذا وافقت، تُرسل الإحداثيات إلى api-adresse.data.gouv.fr لتحويلها إلى عنوان؛ وتتلقى RATP العنوان لا الإحداثيات. يمكنك الرفض وإدخال نقطة الانطلاق يدويًا.',
      initial: 'اختر طريقة تحديد نقطة الانطلاق.', requesting: 'جارٍ طلب الإذن بالوصول إلى الموقع…',
      useLocation: 'استخدم موقعي', retry: 'أعد محاولة تحديد موقعي',
      locationError: 'تم رفض الموقع أو أنه غير متاح. أدخل نقطة الانطلاق أو تابع دون استخدام الموقع.',
      addressError: 'تعذّر تحويل موقعك إلى عنوان. أدخل نقطة الانطلاق أو تابع دون استخدام الموقع.',
      opening: 'جارٍ فتح مسار RATP…', departureLabel: 'نقطة الانطلاق (عنوان أو محطة)',
      placeholder: 'أدخل عنوانًا أو محطة', openManual: 'افتح مسار RATP',
      continueWithout: 'تابع إلى RATP دون استخدام الموقع', back: 'العودة إلى La Colline Gambetta',
      privacyLink: 'الخصوصية'
    },
    tr: {
      title: 'Bonjour RATP açılamadı',
      intro: 'Konumunuzu kullanarak veya başlangıç noktasını yazarak La Colline Gambetta, 4 Rue Belgrand, 75020 Paris için RATP rotası oluşturun.',
      privacy: 'Konumunuz yalnızca işlem yaptıktan ve tarayıcınız izin verdikten sonra istenir. İzin verirseniz koordinatlar adrese dönüştürülmek üzere api-adresse.data.gouv.fr adresine gönderilir; RATP’ye koordinatlar değil adres iletilir. İzin vermeyip başlangıç noktasını kendiniz yazabilirsiniz.',
      initial: 'Başlangıç noktasını nasıl belirleyeceğinizi seçin.', requesting: 'Konum erişimi isteniyor…',
      useLocation: 'Konumumu kullan', retry: 'Konumumu yeniden dene',
      locationError: 'Konum reddedildi veya kullanılamıyor. Bir başlangıç noktası yazın ya da konum kullanmadan devam edin.',
      addressError: 'Konumunuz bir adrese dönüştürülemedi. Bir başlangıç noktası yazın ya da konum kullanmadan devam edin.',
      opening: 'RATP rotası açılıyor…', departureLabel: 'Başlangıç (adres veya istasyon)',
      placeholder: 'Bir adres veya istasyon girin', openManual: 'RATP rotasını aç',
      continueWithout: 'Konum kullanmadan RATP’de devam et', back: 'La Colline Gambetta’ya dön',
      privacyLink: 'Gizlilik'
    },
    hi: {
      title: 'Bonjour RATP नहीं खुल सका',
      intro: 'अपनी लोकेशन का उपयोग करके या शुरुआती स्थान दर्ज करके La Colline Gambetta, 4 Rue Belgrand, 75020 Paris तक RATP मार्ग बनाएँ।',
      privacy: 'लोकेशन केवल आपके कार्रवाई करने और ब्राउज़र की अनुमति मिलने के बाद माँगी जाती है। अनुमति देने पर निर्देशांक को पते में बदलने के लिए api-adresse.data.gouv.fr को भेजा जाता है; RATP को पता मिलता है, निर्देशांक नहीं। आप मना करके शुरुआती स्थान दर्ज कर सकते हैं।',
      initial: 'शुरुआती स्थान चुनने का तरीका तय करें।', requesting: 'लोकेशन की अनुमति माँगी जा रही है…',
      useLocation: 'मेरी लोकेशन इस्तेमाल करें', retry: 'लोकेशन फिर से आज़माएँ',
      locationError: 'लोकेशन की अनुमति नहीं मिली या लोकेशन उपलब्ध नहीं है। शुरुआती स्थान दर्ज करें या लोकेशन के बिना जारी रखें।',
      addressError: 'आपकी लोकेशन को पते में नहीं बदला जा सका। शुरुआती स्थान दर्ज करें या लोकेशन के बिना जारी रखें।',
      opening: 'RATP मार्ग खोला जा रहा है…', departureLabel: 'शुरुआती स्थान (पता या स्टेशन)',
      placeholder: 'पता या स्टेशन दर्ज करें', openManual: 'RATP मार्ग खोलें',
      continueWithout: 'लोकेशन के बिना RATP पर जारी रखें', back: 'La Colline Gambetta पर वापस जाएँ',
      privacyLink: 'गोपनीयता'
    }
  };

  /* Destination : adresse du restaurant au format RATP (numero, rue,
     departement, ville), celui de leurs propres liens d'itineraire. */
  var DESTINATION_FOR_RATP = '4, Rue Belgrand, 75, Paris';
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var form = document.getElementById('ratp-manual-form');
  var departure = document.getElementById('ratp-departure');
  var locationButton = document.getElementById('ratp-use-location');
  var status = document.getElementById('ratp-fallback-status');
  if (!form || !departure || !locationButton || !status) return;

  function supportedLanguage(value) {
    return (value || '').toLowerCase().split('-')[0];
  }

  function chooseLanguage() {
    var value = '';
    try {
      value = new URLSearchParams(window.location.search).get('lang') || '';
      if (!value) value = window.localStorage.getItem('lcg-lang') || '';
    } catch (e) {}
    if (!value) value = (navigator.language || 'fr').split('-')[0];
    value = supportedLanguage(value);
    return Object.prototype.hasOwnProperty.call(COPIES, value) ? value : 'en';
  }

  var language = chooseLanguage();
  var copy = COPIES[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = copy.title + ' — La Colline Gambetta';
  document.querySelectorAll('[data-copy]').forEach(function (element) {
    var key = element.getAttribute('data-copy');
    if (copy[key]) element.textContent = copy[key];
  });
  departure.placeholder = copy.placeholder;
  locationButton.textContent = copy.useLocation;

  function showStatus(message) {
    status.textContent = message;
  }

  /* Itineraire officiel : le depart part dans ?start=, l'arrivee dans ?end=.
     Sans position, on n'envoie que l'arrivee (le site propose alors la saisie). */
  function routeUrl(origin) {
    var url = new URL('https://www.ratp.fr/itineraires');
    var cleanOrigin = (origin || '').trim();
    if (cleanOrigin) url.searchParams.set('start', cleanOrigin);
    url.searchParams.set('end', DESTINATION_FOR_RATP);
    return url.href;
  }

  function addressFromFeature(feature) {
    var properties = feature && feature.properties;
    if (!properties) return '';
    if (typeof properties.label === 'string' && properties.label.trim()) {
      return properties.label.trim();
    }
    return [properties.housenumber, properties.street || properties.name,
      properties.postcode, properties.city || properties.municipality]
      .filter(function (part) { return typeof part === 'string' && part.trim(); })
      .map(function (part) { return part.trim(); }).join(' ');
  }

  function openForAddress(origin) {
    var cleanOrigin = (origin || '').trim();
    if (!cleanOrigin) {
      showStatus(copy.addressError);
      return;
    }
    showStatus(copy.opening);
    window.location.replace(routeUrl(cleanOrigin));
  }

  var requestingLocation = false;
  function requestLocation() {
    if (requestingLocation) return;
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      locationButton.disabled = false;
      locationButton.textContent = copy.retry;
      showStatus(copy.locationError);
      return;
    }

    requestingLocation = true;
    locationButton.disabled = true;
    locationButton.textContent = copy.requesting;
    showStatus(copy.requesting);
    navigator.geolocation.getCurrentPosition(function (position) {
      var latitude = position && position.coords && position.coords.latitude;
      var longitude = position && position.coords && position.coords.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        requestingLocation = false;
        locationButton.disabled = false;
        locationButton.textContent = copy.retry;
        showStatus(copy.locationError);
        return;
      }

      var endpoint = new URL(REVERSE_ENDPOINT);
      endpoint.searchParams.set('lat', String(latitude));
      endpoint.searchParams.set('lon', String(longitude));
      endpoint.searchParams.set('limit', '1');
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 10000) : null;
      var options = { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/geo+json' } };
      if (controller) options.signal = controller.signal;
      fetch(endpoint.href, options).then(function (response) {
        if (!response.ok) throw new Error('reverse-geocode-failed');
        return response.json();
      }).then(function (data) {
        var feature = data && Array.isArray(data.features) ? data.features[0] : null;
        var address = addressFromFeature(feature);
        if (!address) throw new Error('reverse-address-empty');
        requestingLocation = false;
        if (timeout !== null) window.clearTimeout(timeout);
        openForAddress(address);
      }).catch(function () {
        requestingLocation = false;
        if (timeout !== null) window.clearTimeout(timeout);
        locationButton.disabled = false;
        locationButton.textContent = copy.retry;
        showStatus(copy.addressError);
      });
    }, function () {
      requestingLocation = false;
      locationButton.disabled = false;
      locationButton.textContent = copy.retry;
      showStatus(copy.locationError);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  locationButton.addEventListener('click', requestLocation);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var manualOrigin = departure.value.trim();
    if (!manualOrigin) {
      departure.focus();
      return;
    }
    openForAddress(manualOrigin);
  });

  var parameters = new URLSearchParams(window.location.search);
  if (parameters.get('source') === 'metro') {
    window.requestAnimationFrame(requestLocation);
  } else {
    showStatus(copy.initial);
  }
})();
