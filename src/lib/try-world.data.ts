/**
 * مولَّد بـ `node scripts/gen-try-world.mjs` من ملفّات الخريطة: لا يُحرَّر باليد.
 * سطرٌ لكل دولة: الرمز، ثم لكلٍّ من منطقتيها معرّفها في الخريطة واسمها اللاتيني واسمها العربي.
 * أسماءٌ جغرافية حقيقية على مستوى المنطقة فقط؛ كل ما عداها في التجربة افتراضي.
 */
export const TRY_WORLD_ROWS = `
AD|AND-4876|Andorra la Vella|أندورا لا فيلا|AND-4877|La Massana|لامسانا
AE|ARE-349|Emirate of Abu Dhabi|أبوظبي|ARE-348|Emirate of Sharjah|الشارقة
AF|AFG-1767|Kabul|كابول|AFG-1742|Herat|هرات
AG|ATG-5092|Redonda|ريدوندا|ATG-5098|Saint John|سان جون
AI|AIA-5125|The Quarter|ذا كوارتر|AIA-5115|East End|الطرف الشرقي
AM|ARM-1554|Armavir|آرماوير|ARM-1671|Ararat|أرارات
AO|AGO-1889|Cunene|كونيني|AGO-1882|Zaire|زائير
AR|ARG-1299|Córdoba|كوردوبا|ARG-1275|Mendoza|مندوزا
AS|ASM-4999|Manu'a Islands|مانوس|ASM-5000|Rose Atoll|روز أتول
AT|AUT-2325|Carinthia|كيرنتن|AUT-2323|Styria|شتايرمارك
AU|AUS-2654|New South Wales|نيوساوث ويلز|AUS-2656|Victoria|فيكتوريا
AX|ALD-4820|Vårdö|فاردو|ALD-4810|Jomala|جومالا
AZ|AZE-1689|Baku|باكو|AZE-1679|Ganja|كنجه
BB|BRB-1990|Saint Andrew|سانت أندرو|BRB-1996|Saint Michael|سانت مايكل
BD|BGD-1806|Dhaka|دكا|BGD-2488|Sylhet|سيلهيت
BE|BEL-2|Hainaut|هينو|BEL-3479|West Flanders|فلاندرز الغربية
BF|BFA-2815|Kadiogo|كاديوغو|BFA-2799|Houet|هويت
BG|BGR-2254|Burgas|بورغاس|BGR-2253|Vidin|فيدين
BH|BHR-4929|Capital|العاصمة|BHR-4930|Muharraq|المحرق
BI|BDI-2641|Makamba|ماكامبا|BDI-2638|Cibitoke|سيبيتوك
BJ|BEN-2175|Littoral|الإدارة الساحلية|BEN-2169|Borgou|إدارة بورغو
BM|BMU-5143|Southampton|ساوثهامبتون|BMU-5138|Paget Parish|باجيت
BN|BRN-1182|Brunei-Muara|بروناي - موارا|BRN-1183|Temburong|تيمبورونغ
BO|BOL-1938|Pando|إدارة باندو|BOL-1291|Cochabamba|إدارة كوتشابامبا
BR|BRA-1311|São Paulo|ساو باولو|BRA-613|Paraná|بارانا
BS|BHS-5034|Ragged Island|جزيرة راجد|BHS-5031|San Salvador Island|جزيرة سان سلفادور
BT|BTN-2440|Punakha|بوناخا|BTN-2437|Gasa|غاسا
BW|BWA-5502|Francistown|فرانسيس|BWA-2649|Southern|المقاطعة الجنوبية
BY|BLR-2344|Grodno|أوبلاست جردونه|BLR-2340|Mahilioŭ|موغيليوف أوبلاست
BZ|BLZ-1324|Cayo|كايو|BLZ-1355|Stann Creek|ستان كريك
CA|CAN-682|Ontario|أونتاريو|CAN-683|Quebec|كيبك
CD|COD-1897|Katanga|كاتانغا|COD-1461|Équateur|إكواتور
CF|CAF-867|Haut-Mbomou Prefecture|هوت مبومو|CAF-795|Lobaye Prefecture|لوبايه
CG|COG-5855|Pointe-Noire|بوينت نوير|COG-3346|Plateaux|إدارة بلاتيوكس
CH|CHE-161|Neuchâtel|كانتون نيوشاتل|CHE-3426|Solothurn|كانتون سولوتورن
CI|CIV-3458|Lagunes|لاغونس|CIV-3431|Savanes|سافانا
CK|COK-4951|Aitutaki|أيتوتاكي|COK-4954|Mitiaro|ميتيارو
CL|CHL-2691|Aysén|آيسن|CHL-20010|Ñuble|نوبل
CM|CMR-1462|Far North|الشمال الأقصى|CMR-1476|Littoral|المنطقة الساحلية
CN|CHN-1155|Beijing|بكين|CHN-1756|Xinjiang|سنجان
CO|COL-1424|Guainía|إدارة غواينيا|COL-1318|La Guajira|إدارة لا غواخيرا
CR|CRI-1331|San José|سان خوسيه|CRI-1333|Alajuela|الأخويلا
CU|CUB-1368|Las Tunas|لاس توناس|CUB-1319|Cienfuegos|سينفويغوس
CV|CPV-5046|Santa Catarina|سانتا كاتارينا|CPV-5053|Praia|برايا
CY|CYP-3463|Larnaca|لارنكا|CYP-3465|Paphos|بافوس
CZ|CZE-1598|Hradec Králové|هرادتس كرالوفه|CZE-10369|Plzeň-|بلزن-المدينة
DE|DEU-1599|Berlin|برلين|DEU-1572|North Rhine-Westphalia|شمال الراين-وستفاليا
DJ|DJI-1567|Djibouti|جيبوتي|DJI-1566|Ali Sabieh|علي صبيح
DK|DNK-3417|Southern Denmark|سيد دنمارك|DNK-3419|Denmark|هوفدستادن
DM|DMA-1436|Saint Joseph|أبرشية القديس جوزيف|DMA-1438|Saint Mark|أبرشية القديس مارك
DO|DOM-1973|Pedernales|بيدرناليس|DOM-1983|Samaná|سامانا
DZ|DZA-2195|Algiers|الجزائر|DZA-2145|Oran|وهران
EC|ECU-1411|Sucumbíos|سوكومبيوس|ECU-1284|Chimborazo|تشيمبورازو
EE|EST-1656|Järva|يارفا|EST-2346|Pärnu|بارنو
ER|ERI-1560|Gash-Barka|القاش وبركة|ERI-1562|Debub|الجنوب
ES|ESP-5833|Community of Madrid|مدريد|ESP-5821|Granada|غرناطة
ET|ETH-3133|Addis Ababa|أديس أبابا|ETH-3131|Oromia|أوروميا
FI|FIN-3190|North Karelia|كاريليا الشمالية|FIN-3191|Finland Proper|فارسينايس سوومي
FJ|FJI-2619|Northern|القسم الشمالي|FJI-2620|Western|القسم الغربي
FM|FSM-4941|Pohnpei State|بوهنبي|FSM-4943|Yap State|ياب
FR|FRA-5333|Paris|باريس|FRA-5338|Rhône|رون
GA|GAB-2624|Ogooué-Maritime|أوغووي - البحرية|GAB-2623|Nyanga|نيانغا
GB|GBR-4809|London|مدينة لندن|GBR-5690|Birmingham|برمينغهام
GD|GRD-5072|Saint George|أبرشية القديس جورج|GRD-5071|Saint David|أبرشية القديس ديفيد
GE|GEO-3030|Imereti|إيميريتي|GEO-3027|Adjara|أجاريا
GH|GHA-2172|Greater Accra|أكرا الكبرى|GHA-2155|Northern|الإقليم الشمالي
GL|GRL-2743|Qaasuitsup|كاسويتسوب|GRL-2738|Pituffik|بيتوفيك
GM|GMB-2153|Banjul|بانجول|GMB-5512|West Coast|قسم الساحل الغربي
GN|GIN-5630|Conakry|كوناكري|GIN-5643|Kindia|كينديا
GQ|GNQ-1470|Litoral|ليتورال|GNQ-1468|Centro Sur|سينترو سور
GR|GRC-2992|Mount Athos|جبل آثوس|GRC-2991|Centre Macedonia|مقدونيا الوسطى
GT|GTM-1952|Suchitepéquez|إدارة سوشيتبيكيز|GTM-1950|Escuintla|إدارة إسكوينتلا
GW|GNB-772|Oio|أويو|GNB-771|Cacheu|كاشيو
GY|GUY-676|Pomeroon-Supenaam|بوميرون-سوبنام|GUY-674|Upper Demerara-Berbice|أوت ديمارارا بيربيس
HK|HKG-5162|Sai Kung|ساي كونغ|HKG-5160|Wong Tai Sin District|وونغ تاي سين
HN|HND-662|El Paraíso|إدارة بارايسو|HND-650|Santa Bárbara|إدارة سانتا باربرا
HR|HRV-1608|Koprivnica-Križevci|كوبريفنيكا-كريزفتسي|HRV-1491|Šibenik-Knin|شيبينيك-كنين
HT|HTI-1387|Nord|الإدارة الشمالية|HTI-1388|Ouest|الإدارة الغربية
HU|HUN-3156|Győr-Moson-Sopron|ديور-موشون-سوبرون|HUN-4918|Szolnok|سولنوك
IE|IRL-725|Kerry|كري|IRL-727|Roscommon|روسكومون
IL|ISR-3055|Central|المنطقة الوسطى|ISR-3056|Northern|المنطقة الشمالية
IN|IND-2428|Delhi|دلهي|IND-2442|Kerala|كيرلا
IQ|IRQ-3063|Baghdad|بغداد|IRQ-3051|Nineveh|نينوى
IR|IRN-3216|Tehran|طهران|IRN-3212|Fars|فارس
IS|ISL-710|Western|الإقليم الغربي|ISL-704|Southern Peninsula|شبه الجزيرة الجنوبية
IT|ITA-5422|Rome|روما|ITA-5450|Milan|ميلانو
JM|JAM-1382|Saint Andrew|أبريشة سانت أندرو|JAM-1381|Saint Mary|أبرشية سانت ماري
JO|JOR-851|Amman|العاصمة|JOR-854|Irbid|إربد
JP|JPN-1860|Tokyo|طوكيو|JPN-1852|Ōsaka Prefecture|أوساكا
KG|KGZ-1115|Bishkek|بيشكك|KGZ-1122|Osh|أوش
KH|KHM-1779|Koh Kong|كوه كونغ|KHM-1786|Kandal|كندال
KM|COM-4934|Mohéli|موهيلي|COM-4936|Anjouan|أنجوان
KN|KNA-5102|Saint George Gingerland|جينجرلاند|KNA-5106|Saint Mary Cayon|كايون سانت ماري باريش
KP|PRK-3305|Pyongyang|بيونغيانغ|PRK-3312|North Pyongan|بيونغان الشمالية
KR|KOR-2503|Daejeon|دايجون|KOR-2496|Gangwon|غانغوون
KW|KWT-1663|Capital|العاصمة|KWT-3506|Hawally|حولي
KZ|KAZ-4830|Nur-Sultan|نور سلطان|KAZ-3203|Karaganda|قراغندي
LA|LAO-3282|Savannakhet|سافاناكيت|LAO-3288|Houaphanh|هوا فان
LB|LBN-3024|Beirut|بيروت|LBN-3023|North|الشمال
LC|LCA-5081|Gros Islet Quarter|حي غروس إسليت|LCA-5076|Anse la Raye Quarter|حي أنس لا راي
LI|LIE-4899|Schellenberg|شلينبرج|LIE-4901|Planken|بلانكين
LK|LKA-2470|Colombo|كولومبو|LKA-2451|Ampara|أمبارا
LR|LBR-1458|River Gee|ريفر جي|LBR-780|Grand Kru|غراند كرو
LS|LSO-1202|Berea|بيريا|LSO-1215|Thaba-Tseka|ثابا-تسيكا
LT|LTU-936|Telšiai|تيلسياي|LTU-1070|Marijampolė|ماريامبوله
LU|LUX-908|Luxembourg|لوكسمبورغ|LUX-906|Diekirch|ديكرش
LV|LVA-1094|Riga|ريغا|LVA-1077|Valka|فالكاس
LY|LBY-2984|Benghazi|بنغازي|LBY-2970|Misrata|مصراتة
MA|MAR-1451|Rabat-Salé-Zemmour-Zaër|الرباط سلا زمور زعير|MAR-1450|Grand Casablanca|الدار البيضاء الكبرى
MD|MDA-1648|Telenești|تيلينيشتي|MDA-1625|Taraclia|تاراكليا
ME|MNE-1518|Tivat|تيفات|MNE-1507|Kotor|كوتور
MG|MDG-5876|Melaky|ميلاكي|MDG-5882|Vatovavy-Fitovinany|فاتوفافي فيتوفيناني
MH|MHL-4968|Ralik Chain|سلسلة راليك|MHL-4969|Ratak Chain|سلسلة راتاك
MK|MKD-2901|Skopje|إسكوبية|MKD-4845|Struga|ستروغا
ML|MLI-2792|Bamako|باماكو|MLI-2810|Ségou|سيغو
MM|MMR-3268|Bago|باغو|MMR-3269|Yangon|يانغون
MN|MNG-3320|Khovd|خوفد|MNG-3324|Orkhon|أورخون
MP|MNP-4937|Rota|روتا|MNP-4940|Northern Mariana Islands|جزر ماريانا الشمالية
MR|MRT-2787|Nouakchott|نواكشوط|MRT-2788|Trarza|الترارزة
MS|MSR-5089|Saint Peter|سان بطرس|MSR-5087|Saint Anthony|سان أنطونيو
MT|MLT-5969|Mqabba|مقابا|MLT-5933|Swieqi|سويقي
MU|MUS-5191|Quatre Bornes|كواتر بورنيه|MUS-5196|Vacoas-Phoenix|فاكوس-فينيكس
MV|MDV-5240|Gaafu Alif Atoll|غافو أليف أتول|MDV-5239|Laamu Atoll|لامو أتول
MW|MWI-1924|Phalombe|فالومبي|MWI-1923|Mulanje|مولاني
MX|MEX-2727|Mexico|مدينة مكسيكو|MEX-2719|Jalisco|خاليسكو
MY|MYS-4831|Kuala Lumpur|كوالالمبور|MYS-1148|Selangor|سلاغور
MZ|MOZ-1200|Nampula|نامبولا|MOZ-1905|Sofala|سوفالا
NA|NAM-3353|Omaheke|أوماهيكي|NAM-3354|Kavango|أوكافانغو
NC|NCL-559|North|المقاطعة الشمالية|NCL-1258|Loyalty Islands|جزر لويالتي
NE|NER-94|Niamey|نيامي|NER-91|Maradi|مرادي
NG|NGA-2869|Kano State|كانو|NGA-2850|Lagos|لاغوس
NI|NIC-660|Masaya|إدارة مسايا|NIC-668|Boaco|إدارة بواكو
NL|NLD-3486|North Holland|شمال-هولندا|NLD-3485|South Holland|جنوب هولندا
NO|NOR-920|Oppland|أوبلاند|NOR-915|Sogn og Fjordane|سوغن وفيوردانه
NP|NPL-1128|Mahakali Zone|ماهاكالي|NPL-373|Rapti Zone|رابتي
NR|NRU-4983|Yaren|ضاحية يارين|NRU-4970|Buada|ضاحية بوادا
NZ|NZL-3404|Northland|نورثلاند|NZL-3400|Canterbury|كانتربيري
OM|OMN-2426|Muscat|مسقط|OMN-2411|Dhofar|ظفار
PA|PAN-3454|Ngöbe-Buglé Comarca|نجوب-بولجي كوماركا|PAN-1340|Panamá|بنما
PE|PER-567|Piura|بيورا|PER-582|San Martín|سان مارتين
PF|PYF-4964|Leeward Islands|جزر ليوارد|PYF-4967|Marquesas Islands|جزر ماركيساس
PG|PNG-1240|Madang|مادانغ|PNG-1252|Milne Bay|خليج ميلن
PH|PHL-5543|Metro Manila|حاضرة مانيلا|PHL-5528|Davao|دافاو
PK|PAK-1113|Punjab|البنجاب|PAK-1114|Sindh|السند
PL|POL-3167|Opole Voivodeship|أوبولي|POL-3143|Lubusz Voivodeship|لوبوسكي
PM|SPM-4866|Saint Pierre and Miquelon|سان بيير وميكلون|SPM-4867|Miquelon-Langlade|ميكلون ولانغليد
PS|GAZ+00?|Gaza|غزة|WEB+00?|West Bank|الضفة الغربية
PT|PRT-735|Azores|الأزور|PRT-5498|Setúbal|شطوبر
PW|PLW-5248|Kayangel|كايانغيل|PLW-5255|Ngchesar|نيغتشيسار
PY|PRY-608|Guairá|غوايرا|PRY-610|Ñeembucú|إدارة نيمبوكو
QA|QAT-1099|Doha|الدوحة|QAT-1100|Al Rayyan|بلدية الريان
RO|ROU-308|Iași|ياش|ROU-280|Timiș|تيميش
RS|SRB-830|Nišava|نيشافا|SRB-125|Bor|بور
RU|RUS-2337|Saint Petersburg|سانت بطرسبرغ|RUS-2417|Republic of Dagestan|داغستان
RW|RWA-3495|Kigali|كيغالي|RWA-3492|Western|المحافظة الغربية
SA|SAU-1097|Riyadh|الرياض|SAU-888|Makkah|مكة المكرمة
SB|SLB-3507|Western|المحافظة الغربية|SLB-1262|Central|المقاطعة الوسطى
SC|SYC-5222|Roche Caiman|روش كايمان|SYC-5221|Les Mamelles|لس ماميلس
SD|SDN-874|Khartoum|الخرطوم|SDN-875|Al Jazirah|الجزيرة
SE|SWE-194|Stockholm|ستوكهولم|SWE-3429|Skåne|اسكونه
SG|SGP-4872|South West Community Development Council|الجنوب الغربي|SGP-4875|South East Community Development Council|الجنوب الشرقي
SH|SHN-4864|Saint Helena|سانت هيلينا|SHN-4863|Ascension|جزيرة أسينشين
SI|SVN-1012|Idrija|إيدرييا|SVN-235|Lovrenc na Pohorju|لوفرينس نا بوهورجو
SK|SVK-1058|Prešov|بريشوف|SVK-1054|Nitra|نيترا
SL|SLE-761|Western Area|المقاطعة الغربية|SLE-762|Northern|المحافظة الشمالية
SM|SMR-4888|Faetano|فيتانو|SMR-4889|Montegiardino|مونتيجاردينو
SO|SOM-2407|Banaadir|بنادر|SOM-2313|Bay|باي
SR|SUR-73|Saramacca|ضاحية ساراماكا|SUR-71|Coronie|ضاحية كوروني
SS|SDS-892|Eastern Equatoria|شرق الاستوائية|SDS-869|Upper Nile|أعالي النيل
ST|STP-4861|São Tomé|ساو نيكولو|STP-4862|Príncipe|برنسيب
SV|SLV-1357|Chalatenango|تشالاتنانغو|SLV-1343|Ahuachapán|إدارة أهواشابان
SY|SYR-4843|Damascus|دمشق|SYR-137|Aleppo|حلب
SZ|SWZ-534|Hhohho|هوهو|SWZ-537|Shiselweni|شيزلويني
TC|TCA-5003|Middle Caicos|كايكوس الوسطى|TCA-5004|North Caicos|شمال كايكوس
TD|TCD-4857|N'Djamena|أنجمينا|TCD-5580|Chari-Baguirmi|شاري باقرمي
TG|TGO-87|Maritime|البحرية|TGO-89|Centre|الأوسط
TH|THA-416|Bangkok|بانكوك|THA-494|Pattani|باتاني
TJ|TJK-5491|Dushanbe|دوشنبه|TJK-367|Khatlon|خاتلون
TL|TLS-542|Liquiçá|ليكويتشيا|TLS-550|Manatuto|ماناتوتو
TM|TKM-359|Lebap|شاردزو|TKM-351|Balkan|بلقان
TN|TUN-108|Tunis|تونس|TUN-114|Sfax|صفاقس
TO|TON-4949|ʻEua|إيوا|TON-4947|Niuas|نيواس
TR|TUR-2265|Istanbul|إسطنبول|TUR-3008|Ankara|أنقرة
TT|TTO-60|Point Fortin|بوينت فورتين|TTO-53|Arima|آريما
TW|TWN-1163|Yilan|ييلان|TWN-3414|Penghu|بسكادورز
TZ|TZA-3378|Dar es Salaam|دار السلام|TZA-3385|Dodoma|دودوما
UA|UKR-326|Dnipropetrovsk|دنيبروبتروفسك أوبلاست|UKR-320|Kirovohrad|كيروفوهراد أوبلاست
UG|UGA-3088|Kampala|كمبالا|UGA-3098|Gulu|غولو
US|USA-3559|New York|نيويورك|USA-3562|Michigan|ميشيغان
UY|URY-11|Soriano|إدارة سوريانو|URY-16|Treinta y Tres|إدارة ترينتا ذا تريس
UZ|UZB-358|Samarqand|سمرقند|UZB-354|Bukhara|بخارى
VC|VCT-5065|Saint Andrew|أبرشية سانت أندرو|VCT-5063|Charlotte|أبرشية شارلوت
VE|VEN-35|Portuguesa|بورتوغيزا|VEN-49|Sucre|سوكري
VI|VIR-4870|Saint Croix|سان كروا|VIR-4868|Saint Thomas|سان توما
VN|VNM-4835|Đắk Nông|داك نونغ|VNM-459|Hòa Bình|هوا بنه
VU|VUT-560|Torba|توربا|VUT-563|Malampa|مالامبا
WF|WLF-4997|Alo|ألو|WLF-4995|Sigave|مدينة سيغاف
WS|WSM-4992|Vaisigano|فايسيجانو|WSM-4985|A'ana|آنا
XK|KOS-5886|Peja|بيخا|KOS-5890|Gjakova|جاكوفا
YE|YEM-3510|'Adan|عدن|YEM-158|Ta'izz|تعز
ZA|ZAF-1208|Gauteng|خاوتينغ|ZAF-1189|Western Cape|كيب الغربية
ZM|ZMB-517|Copperbelt|كوبربيلت|ZMB-520|Lusaka|لوساكا
ZW|ZWE-525|Harare|هراري|ZWE-526|Matabeleland North|ماتابيليلاند الشمالية
`;
