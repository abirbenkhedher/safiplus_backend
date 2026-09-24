// seed/data.js
// ============================================================
// ✅ DONNÉES MASSIVES : OBJETS + MARQUES + MODÈLES
// ============================================================
// Total approximatif :
//   - 17 objets
//   - 80+ marques
//   - 800+ modèles

module.exports = {
  objets: [
    // ============================================================
    // 1. SMARTPHONE
    // ============================================================
    {
      nom: 'SMARTPHONE',
      ordre: 1,
      marques: [
        {
          nom: 'Samsung', ordre: 1,
          modeles: [
            'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S23 Ultra',
            'Galaxy S23+', 'Galaxy S23', 'Galaxy S22 Ultra', 'Galaxy S22',
            'Galaxy S21 Ultra', 'Galaxy S21 FE', 'Galaxy S21', 'Galaxy S20 FE',
            'Galaxy S20', 'Galaxy S10', 'Galaxy S9', 'Galaxy S8',
            'Galaxy Note 20 Ultra', 'Galaxy Note 20', 'Galaxy Note 10+', 'Galaxy Note 10',
            'Galaxy Note 9', 'Galaxy Note 8',
            'Galaxy Z Fold 5', 'Galaxy Z Fold 4', 'Galaxy Z Fold 3',
            'Galaxy Z Flip 5', 'Galaxy Z Flip 4', 'Galaxy Z Flip 3',
            'Galaxy A54', 'Galaxy A53', 'Galaxy A52', 'Galaxy A51', 'Galaxy A50',
            'Galaxy A34', 'Galaxy A33', 'Galaxy A32', 'Galaxy A31', 'Galaxy A30',
            'Galaxy A24', 'Galaxy A23', 'Galaxy A22', 'Galaxy A21', 'Galaxy A20',
            'Galaxy A14', 'Galaxy A13', 'Galaxy A12', 'Galaxy A11', 'Galaxy A10',
            'Galaxy A04', 'Galaxy A03', 'Galaxy A02',
            'Galaxy M54', 'Galaxy M53', 'Galaxy M52', 'Galaxy M34', 'Galaxy M33',
            'Galaxy M32', 'Galaxy M22', 'Galaxy M12', 'Galaxy M02',
            'Galaxy J7', 'Galaxy J5', 'Galaxy J3', 'Galaxy J2'
          ]
        },
        {
          nom: 'Apple', ordre: 2,
          modeles: [
            'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
            'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
            'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 Mini',
            'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini',
            'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
            'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
            'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
            'iPhone 6S Plus', 'iPhone 6S', 'iPhone 6 Plus', 'iPhone 6',
            'iPhone SE (3e gen)', 'iPhone SE (2e gen)', 'iPhone SE (1re gen)'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 3,
          modeles: [
            'Xiaomi 14 Ultra', 'Xiaomi 14 Pro', 'Xiaomi 14', 'Xiaomi 13 Ultra',
            'Xiaomi 13 Pro', 'Xiaomi 13', 'Xiaomi 12 Pro', 'Xiaomi 12',
            'Xiaomi 11T Pro', 'Xiaomi 11T', 'Xiaomi Mi 11', 'Xiaomi Mi 10',
            'Xiaomi Mi 9', 'Xiaomi Mi 8',
            'Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13', 'Redmi Note 12 Pro',
            'Redmi Note 12', 'Redmi Note 11 Pro', 'Redmi Note 11', 'Redmi Note 10 Pro',
            'Redmi Note 10', 'Redmi Note 9 Pro', 'Redmi Note 9', 'Redmi Note 8 Pro',
            'Redmi Note 8', 'Redmi Note 7',
            'Redmi 13C', 'Redmi 13', 'Redmi 12C', 'Redmi 12', 'Redmi 10', 'Redmi 9',
            'Redmi 9A', 'Redmi 9C', 'Redmi 8', 'Redmi 7', 'Redmi 6',
            'Poco F5 Pro', 'Poco F5', 'Poco F4', 'Poco F3', 'Poco X6 Pro',
            'Poco X6', 'Poco X5 Pro', 'Poco X5', 'Poco X4 Pro', 'Poco X3 Pro',
            'Poco X3 NFC', 'Poco M6 Pro', 'Poco M6', 'Poco M5', 'Poco M4 Pro',
            'Poco M3', 'Poco C65', 'Poco C55'
          ]
        },
        {
          nom: 'Oppo', ordre: 4,
          modeles: [
            'Find X7 Ultra', 'Find X7', 'Find X6 Pro', 'Find X6', 'Find X5 Pro',
            'Find X5', 'Find X3 Pro',
            'Reno 12 Pro', 'Reno 12', 'Reno 11 Pro', 'Reno 11', 'Reno 10 Pro+',
            'Reno 10 Pro', 'Reno 10', 'Reno 8 Pro', 'Reno 8', 'Reno 7', 'Reno 6',
            'Reno 5', 'Reno 4', 'Reno 3',
            'A98', 'A97', 'A96', 'A95', 'A94', 'A78', 'A77', 'A76', 'A74', 'A58',
            'A57', 'A54', 'A53', 'A38', 'A31', 'A17', 'A16', 'A15',
            'F21 Pro', 'F19 Pro', 'F17 Pro'
          ]
        },
        {
          nom: 'Huawei', ordre: 5,
          modeles: [
            'P60 Pro', 'P60', 'P50 Pro', 'P50', 'P40 Pro', 'P40', 'P30 Pro',
            'P30 Lite', 'P30', 'P20 Pro', 'P20 Lite', 'P20', 'P10', 'P9',
            'Mate 60 Pro', 'Mate 60', 'Mate 50 Pro', 'Mate 50', 'Mate 40 Pro',
            'Mate 30 Pro', 'Mate 30', 'Mate 20 Pro', 'Mate 20', 'Mate 10 Pro',
            'Nova 12 Pro', 'Nova 12', 'Nova 11 Pro', 'Nova 11', 'Nova 10 Pro',
            'Nova 10', 'Nova 9', 'Nova 8', 'Nova 7', 'Nova 5T',
            'Y9 Prime', 'Y9s', 'Y7a', 'Y6p', 'Y5p'
          ]
        },
        {
          nom: 'Honor', ordre: 6,
          modeles: [
            'Magic 6 Pro', 'Magic 6', 'Magic 5 Pro', 'Magic 5', 'Magic 4 Pro',
            'Magic 4', 'Magic 3',
            'Honor 100 Pro', 'Honor 100', 'Honor 90 Pro', 'Honor 90', 'Honor 80',
            'Honor 70', 'Honor 50', 'Honor 30',
            'X9b', 'X9a', 'X9', 'X8b', 'X8a', 'X8', 'X7', 'X6',
            'Play 8T', 'Play 7T', 'Play 6T', 'Play 5T'
          ]
        },
        {
          nom: 'OnePlus', ordre: 7,
          modeles: [
            'OnePlus 12', 'OnePlus 12R', 'OnePlus 11', 'OnePlus 10 Pro',
            'OnePlus 10T', 'OnePlus 9 Pro', 'OnePlus 9', 'OnePlus 8 Pro',
            'OnePlus 8', 'OnePlus 7 Pro', 'OnePlus 7', 'OnePlus 6T', 'OnePlus 6',
            'OnePlus 5T', 'OnePlus 5', 'OnePlus 3T',
            'Nord 4', 'Nord 3', 'Nord 2T', 'Nord 2', 'Nord N30', 'Nord N20',
            'Nord N10', 'Nord CE 4', 'Nord CE 3', 'Nord CE 2'
          ]
        },
        {
          nom: 'Realme', ordre: 8,
          modeles: [
            'Realme GT 5 Pro', 'Realme GT 5', 'Realme GT 3', 'Realme GT 2 Pro',
            'Realme GT 2', 'Realme GT Neo 5', 'Realme GT Neo 3', 'Realme GT Neo 2',
            'Realme 12 Pro+', 'Realme 12 Pro', 'Realme 12', 'Realme 11 Pro+',
            'Realme 11 Pro', 'Realme 11', 'Realme 10 Pro', 'Realme 10',
            'Realme 9 Pro', 'Realme 9', 'Realme 8 Pro', 'Realme 8',
            'Realme 7 Pro', 'Realme 7', 'Realme 6', 'Realme 5',
            'Realme C67', 'Realme C55', 'Realme C53', 'Realme C35', 'Realme C33',
            'Realme C31', 'Realme C25', 'Realme C21', 'Realme C15', 'Realme C11',
            'Realme Narzo 60 Pro', 'Realme Narzo 60', 'Realme Narzo 50'
          ]
        },
        {
          nom: 'Infinix', ordre: 9,
          modeles: [
            'Infinix Note 40 Pro', 'Infinix Note 40', 'Infinix Note 30 Pro',
            'Infinix Note 30', 'Infinix Note 12 Pro', 'Infinix Note 12',
            'Infinix Note 11', 'Infinix Note 10 Pro', 'Infinix Note 10',
            'Infinix Hot 40 Pro', 'Infinix Hot 40', 'Infinix Hot 30', 'Infinix Hot 20',
            'Infinix Hot 12', 'Infinix Hot 11', 'Infinix Hot 10', 'Infinix Hot 9',
            'Infinix Smart 8', 'Infinix Smart 7', 'Infinix Smart 6', 'Infinix Smart 5',
            'Infinix Zero 30', 'Infinix Zero 20', 'Infinix Zero 8',
            'Infinix Pova 6 Pro', 'Infinix Pova 6', 'Infinix Pova 5', 'Infinix Pova 4'
          ]
        },
        {
          nom: 'Tecno', ordre: 10,
          modeles: [
            'Tecno Camon 30 Pro', 'Tecno Camon 30', 'Tecno Camon 20 Pro',
            'Tecno Camon 20', 'Tecno Camon 19', 'Tecno Camon 18', 'Tecno Camon 17',
            'Tecno Spark 20 Pro', 'Tecno Spark 20', 'Tecno Spark 10 Pro', 'Tecno Spark 10',
            'Tecno Spark 9', 'Tecno Spark 8', 'Tecno Spark 7', 'Tecno Spark 6',
            'Tecno Pova 6 Pro', 'Tecno Pova 6', 'Tecno Pova 5', 'Tecno Pova 4',
            'Tecno Phantom X2', 'Tecno Phantom X'
          ]
        },
        {
          nom: 'Vivo', ordre: 11,
          modeles: [
            'Vivo X100 Pro', 'Vivo X100', 'Vivo X90 Pro', 'Vivo X90', 'Vivo X80',
            'Vivo X70 Pro', 'Vivo X60 Pro', 'Vivo X50 Pro', 'Vivo X50',
            'Vivo V30 Pro', 'Vivo V30', 'Vivo V29', 'Vivo V27', 'Vivo V25',
            'Vivo V23', 'Vivo V21', 'Vivo V20', 'Vivo V19',
            'Vivo Y100', 'Vivo Y78', 'Vivo Y77', 'Vivo Y76', 'Vivo Y75', 'Vivo Y73',
            'Vivo Y72', 'Vivo Y71', 'Vivo Y36', 'Vivo Y35', 'Vivo Y33', 'Vivo Y31',
            'Vivo Y27', 'Vivo Y21', 'Vivo Y20', 'Vivo Y17', 'Vivo Y15',
            'Vivo S1', 'Vivo Y91', 'Vivo Y95'
          ]
        },
        {
          nom: 'Motorola', ordre: 12,
          modeles: [
            'Edge 50 Pro', 'Edge 50', 'Edge 40 Pro', 'Edge 40', 'Edge 30 Pro',
            'Edge 30', 'Edge 20 Pro', 'Edge 20',
            'Moto G84', 'Moto G73', 'Moto G72', 'Moto G62', 'Moto G54', 'Moto G53',
            'Moto G52', 'Moto G42', 'Moto G32', 'Moto G31', 'Moto G30', 'Moto G22',
            'Moto G Power', 'Moto G Stylus',
            'Moto E13', 'Moto E22', 'Moto E32',
            'Razr 40 Ultra', 'Razr 40', 'Razr 5G'
          ]
        },
        {
          nom: 'Nokia', ordre: 13,
          modeles: [
            'Nokia XR21', 'Nokia X30', 'Nokia X20', 'Nokia X10',
            'Nokia G60', 'Nokia G50', 'Nokia G42', 'Nokia G22', 'Nokia G21', 'Nokia G20',
            'Nokia C32', 'Nokia C31', 'Nokia C22', 'Nokia C21', 'Nokia C12', 'Nokia C02',
            'Nokia 8.3 5G', 'Nokia 7.2', 'Nokia 6.1', 'Nokia 5.4', 'Nokia 3.4', 'Nokia 2.4'
          ]
        },
        {
          nom: 'Google', ordre: 14,
          modeles: [
            'Pixel 8 Pro', 'Pixel 8', 'Pixel 7 Pro', 'Pixel 7a', 'Pixel 7',
            'Pixel 6 Pro', 'Pixel 6a', 'Pixel 6', 'Pixel 5', 'Pixel 5a',
            'Pixel 4 XL', 'Pixel 4a', 'Pixel 4', 'Pixel 3 XL', 'Pixel 3a', 'Pixel 3'
          ]
        },
        {
          nom: 'Sony', ordre: 15,
          modeles: [
            'Xperia 1 VI', 'Xperia 1 V', 'Xperia 1 IV', 'Xperia 1 III',
            'Xperia 5 V', 'Xperia 5 IV', 'Xperia 5 III', 'Xperia 5 II',
            'Xperia 10 VI', 'Xperia 10 V', 'Xperia 10 IV', 'Xperia 10 III',
            'Xperia Pro-I'
          ]
        },
        {
          nom: 'Asus', ordre: 16,
          modeles: [
            'Zenfone 11 Ultra', 'Zenfone 10', 'Zenfone 9', 'Zenfone 8', 'Zenfone 7',
            'ROG Phone 8 Pro', 'ROG Phone 7', 'ROG Phone 6', 'ROG Phone 5', 'ROG Phone 3'
          ]
        },
        {
          nom: 'Nubia', ordre: 17,
          modeles: [
            'Z60 Ultra', 'Z50 Ultra', 'Z50', 'Red Magic 9 Pro', 'Red Magic 8 Pro',
            'Red Magic 7', 'Red Magic 6'
          ]
        },
        {
          nom: 'Alcatel', ordre: 18,
          modeles: [
            '1S', '1B', '1V', '3X', '3L', '5V', '1SE', 'Pop 4'
          ]
        },
        {
          nom: 'Blackview', ordre: 19,
          modeles: [
            'A200', 'A120', 'A96', 'A80', 'BV9300', 'BV9200', 'BV7200'
          ]
        },
        {
          nom: 'Umidigi', ordre: 20,
          modeles: [
            'F3 Pro', 'F3', 'A15C', 'A13 Pro', 'Bison X10', 'Power 7 Max'
          ]
        },
        {
          nom: 'Doogee', ordre: 21,
          modeles: [
            'S110', 'S100', 'S98', 'S97', 'N50', 'V30'
          ]
        },
        {
          nom: 'Cubot', ordre: 22,
          modeles: [
            'X70', 'X50', 'Note 40', 'Note 30', 'P80', 'P60'
          ]
        },
        {
          nom: 'Oukitel', ordre: 23,
          modeles: [
            'WP32', 'WP23', 'WP19', 'WP18', 'C36', 'C32'
          ]
        },
        {
          nom: 'Wiko', ordre: 24,
          modeles: [
            'Power U30', 'Power U20', 'T50', 'T40', 'T30', 'Y82', 'Y62', 'Y52'
          ]
        },
        {
          nom: 'LG', ordre: 25,
          modeles: [
            'Velvet', 'Wing', 'K92', 'K71', 'K61', 'K52', 'K42', 'G8X ThinQ',
            'G8 ThinQ', 'G7 ThinQ', 'V60 ThinQ', 'V50 ThinQ'
          ]
        },
        {
          nom: 'HTC', ordre: 26,
          modeles: [
            'U23 Pro', 'U23', 'U20 5G', 'U19e', 'U12+', 'U11+', 'U11', 'Desire 22 Pro'
          ]
        },
        {
          nom: 'ZTE', ordre: 27,
          modeles: [
            'Axon 40 Ultra', 'Axon 30', 'Axon 20', 'Blade V50', 'Blade V40',
            'Blade A73', 'Blade A53', 'Blade A33'
          ]
        }
      ]
    },

    // ============================================================
    // 2. TELEPHONE (boutons / basiques)
    // ============================================================
    {
      nom: 'TELEPHONE',
      ordre: 2,
      marques: [
        {
          nom: 'Nokia', ordre: 1,
          modeles: [
            '105', '106', '110', '130', '150', '215', '225', '230', '3310',
            '5310', '8000 4G', '8110 4G', '2720 Flip'
          ]
        },
        {
          nom: 'Samsung', ordre: 2,
          modeles: ['E1200', 'E1207', 'B310', 'B350', 'B5702', 'C3520', 'X160']
        },
        {
          nom: 'Itel', ordre: 3,
          modeles: ['it2160', 'it2173', 'it5606', 'it5616', 'it5231', 'it2171']
        },
        {
          nom: 'Tecno', ordre: 4,
          modeles: ['T301', 'T315', 'T485', 'T528', 'T901']
        },
        {
          nom: 'Alcatel', ordre: 5,
          modeles: ['1054', '1066', '1068', '2007', '2053', '3025']
        },
        {
          nom: 'Energizer', ordre: 6,
          modeles: ['E130', 'E241S', 'E242', 'Hard Case H280S']
        },
        {
          nom: 'Générique', ordre: 7,
          modeles: ['Bouton simple', 'Bouton double SIM', 'Bouton avec torche']
        }
      ]
    },

    // ============================================================
    // 3. TABLETTE
    // ============================================================
    {
      nom: 'TABLETTE',
      ordre: 3,
      marques: [
        {
          nom: 'Apple', ordre: 1,
          modeles: [
            'iPad Pro 12.9 (6e gen)', 'iPad Pro 12.9 (5e gen)', 'iPad Pro 11 (4e gen)',
            'iPad Pro 11 (3e gen)', 'iPad Air (5e gen)', 'iPad Air (4e gen)',
            'iPad (10e gen)', 'iPad (9e gen)', 'iPad (8e gen)', 'iPad (7e gen)',
            'iPad Mini (6e gen)', 'iPad Mini (5e gen)'
          ]
        },
        {
          nom: 'Samsung', ordre: 2,
          modeles: [
            'Galaxy Tab S9 Ultra', 'Galaxy Tab S9+', 'Galaxy Tab S9', 'Galaxy Tab S9 FE',
            'Galaxy Tab S8 Ultra', 'Galaxy Tab S8+', 'Galaxy Tab S8', 'Galaxy Tab S7 FE',
            'Galaxy Tab S7+', 'Galaxy Tab S7', 'Galaxy Tab S6 Lite', 'Galaxy Tab S6',
            'Galaxy Tab A9+', 'Galaxy Tab A9', 'Galaxy Tab A8', 'Galaxy Tab A7 Lite',
            'Galaxy Tab A7', 'Galaxy Tab A 10.1'
          ]
        },
        {
          nom: 'Lenovo', ordre: 3,
          modeles: [
            'Tab P12 Pro', 'Tab P12', 'Tab P11 Pro (2e gen)', 'Tab P11 Pro',
            'Tab P11 (2e gen)', 'Tab P11', 'Tab M11', 'Tab M10 Plus (3e gen)',
            'Tab M10 Plus', 'Tab M10', 'Tab M9', 'Tab M8', 'Yoga Tab 13', 'Yoga Tab 11'
          ]
        },
        {
          nom: 'Huawei', ordre: 4,
          modeles: [
            'MatePad Pro 13.2', 'MatePad Pro 11', 'MatePad 11.5', 'MatePad 11',
            'MatePad SE 11', 'MatePad SE 10.4', 'MatePad T10', 'MatePad T8'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 5,
          modeles: [
            'Pad 6 Pro', 'Pad 6', 'Pad 6 Max', 'Pad 5', 'Redmi Pad SE', 'Redmi Pad',
            'Redmi Pad 2', 'Poco Pad'
          ]
        },
        {
          nom: 'Oppo', ordre: 6,
          modeles: ['Pad 3 Pro', 'Pad 3', 'Pad 2', 'Pad Air', 'Pad Neo']
        },
        {
          nom: 'Honor', ordre: 7,
          modeles: ['Pad 9', 'Pad V8 Pro', 'Pad X9', 'Pad X8', 'Pad 8']
        },
        {
          nom: 'Realme', ordre: 8,
          modeles: ['Pad 2', 'Pad Mini', 'Pad X', 'Pad']
        },
        {
          nom: 'Amazon', ordre: 9,
          modeles: ['Fire HD 10', 'Fire HD 8', 'Fire HD 7', 'Fire Max 11']
        },
        {
          nom: 'Microsoft', ordre: 10,
          modeles: ['Surface Pro 10', 'Surface Pro 9', 'Surface Pro 8', 'Surface Go 4', 'Surface Go 3']
        },
        {
          nom: 'Asus', ordre: 11,
          modeles: ['Zenpad 10', 'Zenpad 8', 'VivoTab 8']
        },
        {
          nom: 'Acer', ordre: 12,
          modeles: ['Iconia Tab M10', 'Iconia Tab P10', 'Iconia Tab A8']
        },
        {
          nom: 'Générique', ordre: 13,
          modeles: ['Tablette 7"', 'Tablette 10"', 'Tablette 8"']
        }
      ]
    },

    // ============================================================
    // 4. PC-PORTABLE
    // ============================================================
    {
      nom: 'PC-PORTABLE',
      ordre: 4,
      marques: [
        {
          nom: 'HP', ordre: 1,
          modeles: [
            'Pavilion 15', 'Pavilion 14', 'Pavilion 13', 'Pavilion Gaming 15',
            'Pavilion x360', 'Envy 13', 'Envy 15', 'Envy x360 13', 'Envy x360 15',
            'Spectre x360 13', 'Spectre x360 14', 'Spectre x360 16',
            'ProBook 450 G10', 'ProBook 450 G9', 'ProBook 440 G9', 'ProBook 430 G8',
            'EliteBook 840 G10', 'EliteBook 840 G9', 'EliteBook 850 G8', 'EliteBook x360',
            'ZBook Firefly 14', 'ZBook Studio G9', 'ZBook Power G9',
            'Victus 15', 'Victus 16', 'OMEN 16', 'OMEN 17', 'OMEN Transcend 16',
            'Stream 11', 'Stream 14', 'Chromebook 14'
          ]
        },
        {
          nom: 'Dell', ordre: 2,
          modeles: [
            'XPS 13 Plus', 'XPS 13', 'XPS 15', 'XPS 17',
            'Inspiron 15 3000', 'Inspiron 15 5000', 'Inspiron 14', 'Inspiron 16',
            'Inspiron 13', 'Inspiron 17',
            'Latitude 5420', 'Latitude 5430', 'Latitude 7420', 'Latitude 7430',
            'Latitude 3520', 'Latitude 3420', 'Latitude 5530',
            'Precision 3560', 'Precision 3561', 'Precision 5560', 'Precision 7560',
            'Vostro 3520', 'Vostro 3510', 'Vostro 3420', 'Vostro 5620',
            'G15 Gaming', 'G16 Gaming', 'Alienware m15', 'Alienware m17',
            'Alienware x14', 'Alienware x16', 'Alienware m18'
          ]
        },
        {
          nom: 'Lenovo', ordre: 3,
          modeles: [
            'ThinkPad X1 Carbon Gen 11', 'ThinkPad X1 Carbon Gen 10',
            'ThinkPad X1 Yoga', 'ThinkPad X1 Nano', 'ThinkPad X1 Extreme',
            'ThinkPad T14 Gen 4', 'ThinkPad T14s', 'ThinkPad T16', 'ThinkPad T480',
            'ThinkPad E14', 'ThinkPad E15', 'ThinkPad L14', 'ThinkPad P15',
            'IdeaPad 1', 'IdeaPad 3', 'IdeaPad 5', 'IdeaPad Slim 3', 'IdeaPad Slim 5',
            'IdeaPad Flex 5', 'IdeaPad Gaming 3',
            'Yoga Slim 7', 'Yoga Slim 9', 'Yoga 6', 'Yoga 7i', 'Yoga 9i',
            'Legion 5', 'Legion 5 Pro', 'Legion 7', 'Legion Slim 5', 'Legion Slim 7',
            'LOQ 15', 'LOQ 16'
          ]
        },
        {
          nom: 'Asus', ordre: 4,
          modeles: [
            'VivoBook 15', 'VivoBook 14', 'VivoBook 16', 'VivoBook Pro 15',
            'VivoBook S14', 'VivoBook S15', 'VivoBook Flip 14',
            'ZenBook 14', 'ZenBook 14 OLED', 'ZenBook 15', 'ZenBook Pro 14',
            'ZenBook Pro 15', 'ZenBook Duo 14', 'ZenBook Flip 13',
            'ROG Strix G15', 'ROG Strix G16', 'ROG Strix G17', 'ROG Strix Scar 15',
            'ROG Strix Scar 17', 'ROG Zephyrus G14', 'ROG Zephyrus G15',
            'ROG Zephyrus M16', 'ROG Flow X13', 'ROG Flow X16',
            'TUF Gaming F15', 'TUF Gaming F17', 'TUF Gaming A15', 'TUF Gaming A17',
            'TUF Dash F15', 'ExpertBook B1', 'ExpertBook B9'
          ]
        },
        {
          nom: 'Acer', ordre: 5,
          modeles: [
            'Aspire 3', 'Aspire 5', 'Aspire 7', 'Aspire Vero',
            'Swift 1', 'Swift 3', 'Swift 5', 'Swift Go 14', 'Swift X 14',
            'Spin 3', 'Spin 5', 'Spin 7',
            'Nitro 5', 'Nitro 7', 'Nitro V 15', 'Nitro V 16',
            'Predator Helios 300', 'Predator Helios 16', 'Predator Helios Neo 16',
            'Predator Triton 300', 'Predator Triton 500',
            'Chromebook 314', 'Chromebook 315', 'Chromebook Spin 513'
          ]
        },
        {
          nom: 'Apple', ordre: 6,
          modeles: [
            'MacBook Air M3 13"', 'MacBook Air M3 15"', 'MacBook Air M2 13"',
            'MacBook Air M2 15"', 'MacBook Air M1', 'MacBook Air Intel',
            'MacBook Pro 14" M3', 'MacBook Pro 14" M3 Pro', 'MacBook Pro 14" M3 Max',
            'MacBook Pro 16" M3 Pro', 'MacBook Pro 16" M3 Max',
            'MacBook Pro 13" M2', 'MacBook Pro 13" M1', 'MacBook Pro 16" Intel',
            'MacBook 12"'
          ]
        },
        {
          nom: 'MSI', ordre: 7,
          modeles: [
            'Modern 14', 'Modern 15', 'Prestige 14', 'Prestige 15',
            'Summit E13', 'Summit E14', 'Summit E15',
            'Katana GF66', 'Katana GF76', 'Katana 15', 'Katana 17',
            'Sword 15', 'Sword 17', 'Crosshair 15', 'Crosshair 17',
            'Pulse GL66', 'Pulse GL76', 'Raider GE66', 'Raider GE76', 'Raider GE78',
            'Stealth GS66', 'Stealth GS77', 'Titan GT77', 'Vector GP66', 'Vector GP76'
          ]
        },
        {
          nom: 'Microsoft', ordre: 8,
          modeles: [
            'Surface Laptop 5', 'Surface Laptop 4', 'Surface Laptop Go 3',
            'Surface Laptop Studio 2', 'Surface Laptop Studio', 'Surface Laptop SE',
            'Surface Pro 9', 'Surface Pro 8', 'Surface Pro 7', 'Surface Book 3',
            'Surface Go 4', 'Surface Go 3'
          ]
        },
        {
          nom: 'Razer', ordre: 9,
          modeles: [
            'Blade 14', 'Blade 15', 'Blade 16', 'Blade 17', 'Blade Stealth 13',
            'Blade Pro 17'
          ]
        },
        {
          nom: 'Gigabyte', ordre: 10,
          modeles: [
            'Aero 15', 'Aero 16', 'Aero 17', 'Aorus 15', 'Aorus 17',
            'G5', 'G7', 'A5', 'A7'
          ]
        },
        {
          nom: 'Huawei', ordre: 11,
          modeles: [
            'MateBook X Pro', 'MateBook 14', 'MateBook 13', 'MateBook D14',
            'MateBook D15', 'MateBook D16', 'MateBook E'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 12,
          modeles: [
            'Mi Notebook 14', 'Mi Notebook Pro', 'RedmiBook 15', 'RedmiBook Pro 14',
            'RedmiBook Pro 15', 'Xiaomi Book Pro 14', 'Xiaomi Book Pro 16'
          ]
        },
        {
          nom: 'Samsung', ordre: 13,
          modeles: [
            'Galaxy Book 3 Pro', 'Galaxy Book 3', 'Galaxy Book 3 Ultra',
            'Galaxy Book 2 Pro', 'Galaxy Book 2', 'Galaxy Book Odyssey'
          ]
        },
        {
          nom: 'Toshiba', ordre: 14,
          modeles: ['Satellite Pro', 'Portégé X30', 'Tecra A50', 'Dynabook Portégé']
        },
        {
          nom: 'Fujitsu', ordre: 15,
          modeles: ['Lifebook U9311', 'Lifebook A3511', 'Lifebook E5511']
        },
        {
          nom: 'Vaio', ordre: 16,
          modeles: ['Vaio SX14', 'Vaio SX12', 'Vaio FE14', 'Vaio FE15']
        },
        {
          nom: 'Générique', ordre: 17,
          modeles: ['Portable 14"', 'Portable 15.6"', 'Portable 17.3"']
        }
      ]
    },

    // ============================================================
    // 5. UNITE-CENTRALE
    // ============================================================
    {
      nom: 'UNITE-CENTRALE',
      ordre: 5,
      marques: [
        {
          nom: 'HP', ordre: 1,
          modeles: [
            'EliteDesk 800 G9', 'EliteDesk 800 G6', 'EliteDesk 705 G5',
            'ProDesk 400 G9', 'ProDesk 400 G7', 'ProDesk 405 G8', 'ProDesk 600 G6',
            'Z1 Entry Tower G6', 'Z2 Tower G9', 'Z2 Mini G9', 'Z4 G5',
            'OMEN 25L', 'OMEN 30L', 'OMEN 40L', 'Pavilion Desktop TP01'
          ]
        },
        {
          nom: 'Dell', ordre: 2,
          modeles: [
            'OptiPlex 3000', 'OptiPlex 3010', 'OptiPlex 3090', 'OptiPlex 5000',
            'OptiPlex 5090', 'OptiPlex 7000', 'OptiPlex 7090', 'OptiPlex 7010',
            'Vostro 3020', 'Vostro 3910', 'Vostro 5890',
            'Precision 3650', 'Precision 3660', 'Precision 3450', 'Precision 5820',
            'XPS Desktop 8960', 'XPS Desktop 8950',
            'Alienware Aurora R15', 'Alienware Aurora R14'
          ]
        },
        {
          nom: 'Lenovo', ordre: 3,
          modeles: [
            'ThinkCentre M70q', 'ThinkCentre M70s', 'ThinkCentre M70t',
            'ThinkCentre M90q', 'ThinkCentre M90s', 'ThinkCentre M90t',
            'ThinkCentre M720q', 'ThinkCentre M720s',
            'IdeaCentre 3', 'IdeaCentre 5', 'IdeaCentre Gaming 5',
            'Legion Tower 5', 'Legion Tower 7',
            'ThinkStation P360', 'ThinkStation P620'
          ]
        },
        {
          nom: 'Asus', ordre: 4,
          modeles: [
            'ExpertCenter D500', 'ExpertCenter D700', 'ExpertCenter D900',
            'ProArt Station PD5', 'ProArt Station PD500',
            'ROG Strix GT15', 'ROG Strix GT35', 'ROG Strix GA15', 'ROG Strix GA35',
            'TUF Gaming GT501', 'TUF Gaming GT301'
          ]
        },
        {
          nom: 'Acer', ordre: 5,
          modeles: [
            'Aspire TC', 'Aspire XC', 'Aspire C22', 'Aspire C24',
            'Veriton X', 'Veriton S', 'Veriton M', 'Veriton Z',
            'Predator Orion 3000', 'Predator Orion 5000', 'Predator Orion 7000',
            'Nitro 50', 'Nitro 60'
          ]
        },
        {
          nom: 'Apple', ordre: 6,
          modeles: [
            'Mac mini M2', 'Mac mini M2 Pro', 'Mac mini M1', 'Mac mini Intel',
            'Mac Studio M2 Max', 'Mac Studio M2 Ultra', 'Mac Studio M1 Max',
            'iMac 24" M3', 'iMac 24" M1', 'iMac Pro', 'Mac Pro'
          ]
        },
        {
          nom: 'MSI', ordre: 7,
          modeles: [
            'Infinite RS', 'Infinite S', 'Aegis RS', 'Aegis Ti5', 'Aegis SE',
            'Trident 3', 'Trident X', 'MAG Codex 5', 'MAG Infinite S3',
            'MPG Trident AS', 'MPG Velox'
          ]
        },
        {
          nom: 'Gigabyte', ordre: 8,
          modeles: ['Aorus Model S', 'Aorus Model X', 'GB-BRi5', 'GB-BSi7']
        },
        {
          nom: 'Corsair', ordre: 9,
          modeles: ['Vengeance i7400', 'Vengeance i8100', 'One i300', 'One i400']
        },
        {
          nom: 'Générique', ordre: 10,
          modeles: ['Unité centrale standard', 'Unité centrale gaming', 'Unité centrale bureautique']
        }
      ]
    },

    // ============================================================
    // 6. IMPRIMANTE
    // ============================================================
    {
      nom: 'IMPRIMANTE',
      ordre: 6,
      marques: [
        {
          nom: 'HP', ordre: 1,
          modeles: [
            'LaserJet Pro M404dn', 'LaserJet Pro M404dw', 'LaserJet Pro M428fdw',
            'LaserJet M110we', 'LaserJet M110w', 'LaserJet M209dwe',
            'LaserJet M234sdwe', 'LaserJet M236sdw',
            'LaserJet Pro MFP M428fdn', 'LaserJet Enterprise M406dn',
            'DeskJet 2320', 'DeskJet 2720', 'DeskJet 2722', 'DeskJet 3720',
            'DeskJet Plus 4120', 'DeskJet Plus 4155',
            'Envy 6020', 'Envy 6022', 'Envy 6420', 'Envy Inspire 7220',
            'OfficeJet Pro 8025', 'OfficeJet Pro 9015', 'OfficeJet 250',
            'Smart Tank 500', 'Smart Tank 515', 'Smart Tank 7005', 'Smart Tank Plus 555'
          ]
        },
        {
          nom: 'Canon', ordre: 2,
          modeles: [
            'Pixma MG2540', 'Pixma MG2550', 'Pixma MG3050', 'Pixma MG3650',
            'Pixma TS3150', 'Pixma TS3350', 'Pixma TS3450', 'Pixma TS5350', 'Pixma TS6350',
            'Pixma G3411', 'Pixma G2411', 'Pixma G1411', 'Pixma G3430', 'Pixma G4470',
            'Pixma TR4540', 'Pixma TR7040',
            'Maxify GX6040', 'Maxify GX7040', 'Maxify MB2140', 'Maxify MB2740',
            'LBP6030', 'LBP6030w', 'LBP223dw', 'LBP226dw',
            'MF3010', 'MF217w', 'MF231', 'MF237w', 'MF421dw', 'MF4410', 'MF445dw',
            'i-SENSYS MF445dw', 'i-SENSYS MF746Cx'
          ]
        },
        {
          nom: 'Epson', ordre: 3,
          modeles: [
            'EcoTank L3150', 'EcoTank L3151', 'EcoTank L3160', 'EcoTank L3250',
            'EcoTank L3251', 'EcoTank L3260', 'EcoTank L4150', 'EcoTank L4160',
            'EcoTank L5190', 'EcoTank L5290', 'EcoTank L6170', 'EcoTank L6190',
            'EcoTank L1110', 'EcoTank L3110', 'EcoTank L3111', 'EcoTank L3116',
            'EcoTank ET-2720', 'EcoTank ET-2750', 'EcoTank ET-4700',
            'WorkForce WF-2830', 'WorkForce WF-2835', 'WorkForce WF-2870',
            'WorkForce Pro WF-3820', 'WorkForce Pro WF-4820', 'WorkForce Pro WF-7840',
            'Expression Home XP-2100', 'Expression Home XP-3100', 'Expression Home XP-4100',
            'Expression Premium XP-6100', 'Expression Photo XP-970'
          ]
        },
        {
          nom: 'Brother', ordre: 4,
          modeles: [
            'DCP-L2520DW', 'DCP-L2530DW', 'DCP-L2540DW', 'DCP-L2550DW',
            'DCP-L3510CDW', 'DCP-L3550CDW', 'DCP-1610W', 'DCP-1622WE', 'DCP-9020CDW',
            'HL-L2350DW', 'HL-L2370DN', 'HL-L2375DW', 'HL-L3210CW', 'HL-L3230CDW',
            'HL-L3270CDW', 'HL-1210W', 'HL-1222WE', 'HL-1110', 'HL-L8260CDW',
            'MFC-L2710DW', 'MFC-L2730DW', 'MFC-L2750DW', 'MFC-L3710CW', 'MFC-L3750CDW',
            'MFC-L8690CDW', 'MFC-J1010DW', 'MFC-J1300DW', 'MFC-J4535DW', 'MFC-J6945DW',
            'MFC-J5335DW', 'MFC-J985DW', 'MFC-L8900CDW'
          ]
        },
        {
          nom: 'Samsung', ordre: 5,
          modeles: [
            'Xpress M2020', 'Xpress M2020W', 'Xpress M2026', 'Xpress M2070',
            'Xpress M2070W', 'Xpress M2070FW', 'Xpress M2825ND', 'Xpress M2835DW',
            'Xpress M2885FW', 'Xpress M3015DW', 'Xpress M3065FW', 'Xpress SL-M2020',
            'Xpress C410W', 'Xpress C430W', 'Xpress C480W', 'Xpress C1810W',
            'SL-C410W', 'SL-C430W', 'SL-C480W', 'SL-C480FW'
          ]
        },
        {
          nom: 'Lexmark', ordre: 6,
          modeles: [
            'B2236dw', 'B2338dw', 'B2442dw', 'B2546dw', 'B3340dw',
            'MB2236adw', 'MB2338adw', 'MB2442adwe', 'MB2546adwe', 'MB3442adw',
            'CX331adwe', 'CX421adn', 'CX522ade', 'CX622ade', 'CX725de',
            'CS331dw', 'CS421dn', 'CS521dn', 'CS622de', 'CS725de'
          ]
        },
        {
          nom: 'Ricoh', ordre: 7,
          modeles: [
            'SP 150', 'SP 210', 'SP 220', 'SP 230', 'SP 277',
            'SP C261', 'SP C261SFNw', 'SP C352', 'MP C3004', 'MP C3504',
            'MP C2004', 'IM C3000', 'IM C3500', 'IM C4500', 'IM 430F'
          ]
        },
        {
          nom: 'Kyocera', ordre: 8,
          modeles: [
            'FS-1040', 'FS-1060DN', 'FS-1320D', 'FS-1370DN',
            'ECOSYS P2040dn', 'ECOSYS P2235dn', 'ECOSYS P3145dn', 'ECOSYS P3260dn',
            'ECOSYS M2040dn', 'ECOSYS M2540dn', 'ECOSYS M3145dn', 'ECOSYS M5526cdn',
            'ECOSYS M6235cidn', 'TASKalfa 2554ci'
          ]
        },
        {
          nom: 'Xerox', ordre: 9,
          modeles: [
            'Phaser 3020', 'Phaser 3260', 'Phaser 3320', 'Phaser 3330', 'Phaser 3610',
            'WorkCentre 3215', 'WorkCentre 3225', 'WorkCentre 3335', 'WorkCentre 3345',
            'VersaLink B400', 'VersaLink B405', 'VersaLink C400', 'VersaLink C405',
            'AltaLink B8045', 'AltaLink C8030'
          ]
        },
        {
          nom: 'Générique', ordre: 10,
          modeles: [
            'Imprimante jet d\'encre', 'Imprimante laser N&B', 'Imprimante laser couleur',
            'Imprimante 3 en 1', 'Imprimante 4 en 1'
          ]
        }
      ]
    },

    // ============================================================
    // 7. ECRAN
    // ============================================================
    {
      nom: 'ECRAN',
      ordre: 7,
      marques: [
        {
          nom: 'Samsung', ordre: 1,
          modeles: [
            'Odyssey G9 49"', 'Odyssey G8 32"', 'Odyssey G7 28"', 'Odyssey G5 27"',
            'Odyssey G3 24"', 'Odyssey Neo G9',
            'ViewFinity S9 27"', 'ViewFinity S8 32"', 'ViewFinity S6 27"',
            'Smart Monitor M8 32"', 'Smart Monitor M7 32"', 'Smart Monitor M5 27"',
            'Essential S3 24"', 'Essential S4 27"',
            'LS24R350 24"', 'LS27R350 27"', 'LS32R550 32"',
            'C24F390 24"', 'C27F390 27"', 'C32F391 32"',
            'S24R650 24"', 'S27R650 27"', 'S32R650 32"',
            'U28E590D 28" 4K', 'U32J590 32" 4K', 'U32R590 32" 4K',
            'F24T350 24"', 'F27T350 27"', 'F32T350 32"'
          ]
        },
        {
          nom: 'LG', ordre: 2,
          modeles: [
            'UltraGear 27GP850', 'UltraGear 27GN800', 'UltraGear 27GL850',
            'UltraGear 32GN600', 'UltraGear 34GP83A', 'UltraGear 38GN950',
            'UltraGear 24GN600', 'UltraGear 27GN950',
            'UltraWide 29WP500', 'UltraWide 34WP500', 'UltraWide 34WN80C',
            'UltraWide 34WK95U', 'UltraWide 38WK95C',
            'UltraFine 27UL500', 'UltraFine 27UL850', 'UltraFine 32UL750',
            'UltraFine 32UN880', 'UltraFine 24MD4KL',
            '24MP400', '24MP60G', '27MP400', '27MP60G', '32MP60G',
            '24MK430H', '27MK430H', '22MK430H', '24MK600M', '27MK600M'
          ]
        },
        {
          nom: 'Dell', ordre: 3,
          modeles: [
            'UltraSharp U2723QE', 'UltraSharp U3223QE', 'UltraSharp U2422H',
            'UltraSharp U2722D', 'UltraSharp U3421WE', 'UltraSharp U3821DW',
            'UltraSharp U4320Q', 'UltraSharp U2419H', 'UltraSharp U2415',
            'P2419H', 'P2422H', 'P2422HE', 'P2722H', 'P2723DE', 'P3222QE', 'P3421W',
            'S2421HN', 'S2421HGF', 'S2721HN', 'S2721HGF', 'S2721QS', 'S3221QS',
            'S3222DGM', 'S3422DWG', 'S2722QC', 'S2722DZ',
            'AW2521H', 'AW2721D', 'AW3423DW', 'AW3821DW'
          ]
        },
        {
          nom: 'HP', ordre: 4,
          modeles: [
            'V22', 'V22i', 'V24', 'V24i', 'V27', 'V27i', 'V28 4K',
            'M22f', 'M24f', 'M27f', 'M27fd', 'M27fw', 'M32f',
            'E22', 'E23', 'E24', 'E27', 'E24u', 'E27u',
            'P22h', 'P24h', 'P27h', 'P32h', 'P24q', 'P27q', 'P27u',
            'Z24n', 'Z27n', 'Z27k', 'Z32', 'Z38c', 'Z43',
            'X24c', 'X27c', 'X32', 'X34', 'X27q', 'X27i', 'X32c',
            'OMEN 25i', 'OMEN 27i', 'OMEN 27q', 'OMEN 27u', 'OMEN 32c'
          ]
        },
        {
          nom: 'Asus', ordre: 5,
          modeles: [
            'ROG Swift PG259QN', 'ROG Swift PG279QM', 'ROG Swift PG32UQX',
            'ROG Swift PG35VQ', 'ROG Swift PG43UQ', 'ROG Swift PG27UQ',
            'ROG Strix XG27AQ', 'ROG Strix XG27AQM', 'ROG Strix XG32VC',
            'ROG Strix XG35VQ', 'ROG Strix XG49VQ',
            'TUF Gaming VG279QM', 'TUF Gaming VG27AQ', 'TUF Gaming VG27AQ1A',
            'TUF Gaming VG27WQ', 'TUF Gaming VG32VQ', 'TUF Gaming VG34VQL1B',
            'TUF Gaming VG24VQ', 'TUF Gaming VG248QG',
            'ProArt PA248QV', 'ProArt PA278QV', 'ProArt PA329CV', 'ProArt PA32UCX',
            'VA24EHE', 'VA27EHE', 'VZ249HE', 'VZ279HE', 'VP28UQG', 'VP32UQ',
            'VG279Q', 'VG278QR', 'VG245H', 'VG248QE', 'VG255H'
          ]
        },
        {
          nom: 'Acer', ordre: 6,
          modeles: [
            'Predator X27', 'Predator X32', 'Predator X34', 'Predator X38',
            'Predator XB273K', 'Predator XB323QK', 'Predator XB271HU',
            'Nitro XV272U', 'Nitro XV273K', 'Nitro XV340CK', 'Nitro VG270',
            'Nitro VG271', 'Nitro VG272', 'Nitro XF243Y', 'Nitro XZ272',
            'KG241Q', 'KG251Q', 'SB220Q', 'SB230', 'SB240Y', 'SB270',
            'KA242Y', 'KA272', 'KA222Q', 'CB242Y', 'CB272', 'CB282K',
            'XZ242Q', 'XZ272', 'XZ322QU', 'XZ342CU'
          ]
        },
        {
          nom: 'BenQ', ordre: 7,
          modeles: [
            'MOBIUZ EX2510S', 'MOBIUZ EX2710S', 'MOBIUZ EX2710Q', 'MOBIUZ EX2710R',
            'MOBIUZ EX3210R', 'MOBIUZ EX3415R',
            'PD2500Q', 'PD2700Q', 'PD2700U', 'PD2725U', 'PD3200U', 'PD3220U',
            'GW2480', 'GW2780', 'GW2485TC', 'GW2785TC', 'GW3290QT',
            'GL2480', 'GL2780', 'GL2460', 'GL2760',
            'EW2480', 'EW2780', 'EW2780Q', 'EW3270U', 'EW3280U',
            'XL2411K', 'XL2540K', 'XL2546K', 'XL2740', 'XL2746S'
          ]
        },
        {
          nom: 'AOC', ordre: 8,
          modeles: [
            '24G2', '24G2U', '27G2', '27G2U', '27G2AE', '32G2', '24G1',
            'C24G1', 'C27G1', 'C32G1', 'C24G2', 'C27G2', 'C32G2',
            '24B2XH', '27B2H', '22B2H', 'I1601FWUX', 'I1601PW',
            'U28G2XU', 'U32G3X', 'Q27G2U', 'Q32G1', 'Q27P1',
            '24P2Q', '27P2Q', '24V2Q', '27V2Q', '22V2Q',
            'AGON AG241QX', 'AGON AG271QG', 'AGON AG322QCX', 'AGON AG493UCX'
          ]
        },
        {
          nom: 'MSI', ordre: 9,
          modeles: [
            'Optix MAG241C', 'Optix MAG241CR', 'Optix MAG271C', 'Optix MAG271CR',
            'Optix MAG272C', 'Optix MAG272CQR', 'Optix MAG321CQR', 'Optix MAG322CQR',
            'Optix G24C', 'Optix G24C4', 'Optix G27C4', 'Optix G27CQ4', 'Optix G32CQ4',
            'Optix MPG341CQR', 'Optix MPG27CQ', 'Optix AG32C', 'Optix AG32CQ',
            'Modern MD241P', 'Modern MD272QP', 'Modern MD271P', 'Modern MD272QXP',
            'PRO MP242', 'PRO MP242P', 'PRO MP271', 'PRO MP271P',
            'Creator PS321URV', 'Creator PS321QR'
          ]
        },
        {
          nom: 'ViewSonic', ordre: 10,
          modeles: [
            'VX2257', 'VX2457', 'VX2458', 'VX2758', 'VX2758-2KP', 'VX3211',
            'XG2401', 'XG2402', 'XG2405', 'XG2705', 'XG270QC', 'XG320U',
            'VP2468', 'VP2768', 'VP2785', 'VP3481',
            'VA2246', 'VA2446', 'VA2456', 'VA2756', 'VA2855',
            'TD2220', 'TD2423', 'TD1630'
          ]
        },
        {
          nom: 'Philips', ordre: 11,
          modeles: [
            '221V8', '241V8', '271V8', '242V8', '272V8', '222B9', '242B9',
            '241B8', '272B8', '243B9', '273B9', '241E1', '271E1', '242E2',
            '272E2', '325E8', '278E1', '276E8', '328E1', '558M1RY',
            '275M1RZ', '272M8', '242M8', '328M6FJMB', '325M7C'
          ]
        },
        {
          nom: 'Générique', ordre: 12,
          modeles: [
            'Écran 19"', 'Écran 21.5"', 'Écran 24"', 'Écran 27"', 'Écran 32"',
            'Écran 24" 4K', 'Écran 27" 4K', 'Écran 32" 4K'
          ]
        }
      ]
    },

    // ============================================================
    // 8. SPEAKER
    // ============================================================
    {
      nom: 'SPEAKER',
      ordre: 8,
      marques: [
        {
          nom: 'JBL', ordre: 1,
          modeles: [
            'Flip 6', 'Flip 5', 'Flip 4', 'Flip 3', 'Flip Essential',
            'Charge 5', 'Charge 4', 'Charge 3',
            'Go 4', 'Go 3', 'Go 2', 'Go Essential',
            'Xtreme 3', 'Xtreme 2', 'Boombox 3', 'Boombox 2',
            'Pulse 5', 'Pulse 4', 'Partybox 110', 'Partybox 310', 'Partybox 710',
            'Partybox Encore', 'Partybox On-The-Go',
            'Clip 4', 'Clip 3', 'Wind 3', 'Micro 2', 'Tune 760NC', 'Tune 510BT',
            'Control 1 Pro', 'Control 2P', 'EON ONE Compact'
          ]
        },
        {
          nom: 'Bose', ordre: 2,
          modeles: [
            'SoundLink Flex', 'SoundLink Micro', 'SoundLink Mini II', 'SoundLink Color II',
            'SoundLink Revolve', 'SoundLink Revolve+', 'SoundLink Revolve II',
            'Home Speaker 300', 'Home Speaker 500', 'Portable Smart Speaker',
            'L1 Pro8', 'L1 Pro16', 'L1 Pro32', 'S1 Pro', 'S1 Pro+'
          ]
        },
        {
          nom: 'Sony', ordre: 3,
          modeles: [
            'SRS-XB13', 'SRS-XB23', 'SRS-XB33', 'SRS-XB43',
            'SRS-XG300', 'SRS-XG500', 'SRS-XP500', 'SRS-XP700',
            'SRS-XV800', 'SRS-XV900', 'SRS-RA3000', 'SRS-RA5000',
            'MHC-V13', 'MHC-V21', 'MHC-V43', 'MHC-V73', 'MHC-V83',
            'GTK-PG10', 'GTK-XB60', 'GTK-XB72', 'GTK-XB90',
            'SRS-NB10', 'SRS-WS1'
          ]
        },
        {
          nom: 'Anker', ordre: 4,
          modeles: [
            'Soundcore 3', 'Soundcore 2', 'Soundcore Motion+', 'Soundcore Motion Boom',
            'Soundcore Motion Boom Plus', 'Soundcore Mini 3', 'Soundcore Flare 2',
            'Soundcore Rave Neo', 'Soundcore Rave PartyCast', 'Soundcore Trance Go',
            'Soundcore Select 2', 'Soundcore Select Pro', 'Soundcore Boost',
            'Soundcore Icon', 'Soundcore Icon Mini', 'Soundcore Wakey'
          ]
        },
        {
          nom: 'Marshall', ordre: 5,
          modeles: [
            'Emberton', 'Emberton II', 'Willen', 'Kilburn II', 'Stockwell II',
            'Tufton', 'Stanmore II', 'Stanmore III', 'Acton II', 'Acton III',
            'Woburn II', 'Woburn III', 'Uxbridge', 'Voice', 'Major IV', 'Minor III'
          ]
        },
        {
          nom: 'Ultimate Ears', ordre: 6,
          modeles: [
            'Boom 3', 'Boom 4', 'Megaboom 3', 'Megablast', 'Wonderboom 2',
            'Wonderboom 3', 'Hyperboom', 'Blast', 'Roll 2', 'Everboom'
          ]
        },
        {
          nom: 'Bang & Olufsen', ordre: 7,
          modeles: [
            'Beosound A1 2nd Gen', 'Beosound A5', 'Beosound 1', 'Beosound 2',
            'Beosound Balance', 'Beosound Emerge', 'Beosound Level', 'Beoplay P6'
          ]
        },
        {
          nom: 'Harman Kardon', ordre: 8,
          modeles: [
            'Onyx Studio 6', 'Onyx Studio 7', 'Onyx Studio 8', 'Go+ Play 3',
            'Citation 100', 'Citation 200', 'Citation 300', 'Citation 500',
            'Citation One', 'Citation MultiBeam 700', 'Citation Bar'
          ]
        },
        {
          nom: 'Tronsmart', ordre: 9,
          modeles: [
            'Mega Pro', 'Mega Pro S', 'Element T6 Max', 'Element T6 Plus',
            'Bang SE', 'Bang', 'Force', 'Force Pro', 'T2 Plus', 'T6 Max'
          ]
        },
        {
          nom: 'Tribit', ordre: 10,
          modeles: [
            'StormBox', 'StormBox Pro', 'StormBox Mini', 'StormBox Blast',
            'StormBox Flow', 'XSound Go', 'XSound Plus 2', 'XSound Mega',
            'MaxSound Plus', 'BTS31', 'BTS51', 'BTS52'
          ]
        },
        {
          nom: 'LG', ordre: 11,
          modeles: [
            'XBOOM Go PL2', 'XBOOM Go PL5', 'XBOOM Go PL7', 'XBOOM Go PK3',
            'XBOOM Go PK5', 'XBOOM Go PK7', 'XBOOM XL5S', 'XBOOM XL7S',
            'XBOOM XL9T', 'XBOOM ON5', 'XBOOM ON7', 'XBOOM RN5', 'XBOOM RN7'
          ]
        },
        {
          nom: 'Samsung', ordre: 12,
          modeles: [
            'Sound Tower MX-ST40', 'Sound Tower MX-ST50', 'Sound Tower MX-T40',
            'Sound Tower MX-T50', 'Sound Tower MX-T70', 'Sound Tower ST90',
            'R Series R1', 'R Series R3', 'R Series R5', 'R Series R7'
          ]
        },
        {
          nom: 'Beats', ordre: 13,
          modeles: ['Pill+', 'Pill 2.0', 'Beats Pill', 'Beatbox Portable']
        },
        {
          nom: 'Huawei', ordre: 14,
          modeles: ['FreeGO', 'Sound Joy', 'Sound X', 'Sound X 2021', 'Sound SE']
        },
        {
          nom: 'Xiaomi', ordre: 15,
          modeles: [
            'Mi Portable Bluetooth Speaker', 'Mi Portable Bluetooth Speaker 16W',
            'Mi Outdoor Bluetooth Speaker', 'Mi Smart Speaker',
            'Xiaomi Sound', 'Redmi Sound', 'Xiaomi Sound Pro'
          ]
        },
        {
          nom: 'Générique', ordre: 16,
          modeles: [
            'Speaker Bluetooth 5W', 'Speaker Bluetooth 10W', 'Speaker Bluetooth 20W',
            'Speaker portable 30W', 'Enceinte 40W', 'Enceinte 60W'
          ]
        }
      ]
    },

    // ============================================================
    // 9. CASQUE
    // ============================================================
    {
      nom: 'CASQUE',
      ordre: 9,
      marques: [
        {
          nom: 'Sony', ordre: 1,
          modeles: [
            'WH-1000XM5', 'WH-1000XM4', 'WH-1000XM3', 'WH-1000XM2',
            'WH-CH720N', 'WH-CH710N', 'WH-CH510', 'WH-CH520',
            'WH-XB910N', 'WH-XB900N', 'WH-XB700',
            'WF-1000XM5', 'WF-1000XM4', 'WF-1000XM3',
            'WF-C700N', 'WF-C500', 'WF-SP800N', 'WF-SP700N',
            'WH-H910N', 'WH-H810', 'MDR-ZX110', 'MDR-ZX310',
            'WI-1000XM2', 'WI-C100', 'WI-C310', 'WI-XB400',
            'WH-G900N', 'Pulse 3D', 'INZONE H3', 'INZONE H7', 'INZONE H9'
          ]
        },
        {
          nom: 'Bose', ordre: 2,
          modeles: [
            'QuietComfort Ultra Headphones', 'QuietComfort Ultra Earbuds',
            'QuietComfort 45', 'QuietComfort 35 II', 'QuietComfort 35',
            'QuietComfort Earbuds II', 'QuietComfort Earbuds',
            'Sport Earbuds', 'SoundSport Free', 'SoundSport Wireless',
            'Noise Cancelling Headphones 700', 'Noise Cancelling Earbuds 700',
            'SoundLink Around-Ear II', 'SoundLink On-Ear', 'Bose Frames Tempo'
          ]
        },
        {
          nom: 'Apple', ordre: 3,
          modeles: [
            'AirPods Max', 'AirPods Pro 2', 'AirPods Pro', 'AirPods 3', 'AirPods 2',
            'Beats Studio Pro', 'Beats Studio 3', 'Beats Solo 4', 'Beats Solo 3',
            'Beats Fit Pro', 'Beats Studio Buds', 'Beats Studio Buds +',
            'Beats Powerbeats Pro', 'Beats Powerbeats 4', 'Beats Flex'
          ]
        },
        {
          nom: 'JBL', ordre: 4,
          modeles: [
            'Tune 770NC', 'Tune 760NC', 'Tune 720BT', 'Tune 710BT', 'Tune 670NC',
            'Tune 660NC', 'Tune 520BT', 'Tune 510BT', 'Tune 500',
            'Live 770NC', 'Live 760NC', 'Live 670NC', 'Live 660NC', 'Live 460NC',
            'Live Pro 2', 'Live Free 2', 'Live 220BT', 'Live 300TWS',
            'Tour One M2', 'Tour Pro 2', 'Reflect Mini NC', 'Reflect Flow Pro',
            'Quantum 100', 'Quantum 200', 'Quantum 350', 'Quantum 600', 'Quantum 800',
            'Quantum ONE', 'Quantum TWS', 'Endurance Run 2', 'Endurance Peak 3'
          ]
        },
        {
          nom: 'Sennheiser', ordre: 5,
          modeles: [
            'Momentum 4 Wireless', 'Momentum 3 Wireless', 'Momentum True Wireless 3',
            'Momentum True Wireless 2', 'HD 450BT', 'HD 458BT', 'HD 350BT', 'HD 400S',
            'HD 599', 'HD 569', 'HD 559', 'HD 599 SE',
            'CX Plus True Wireless', 'CX True Wireless', 'CX 400BT',
            'PXC 550-II', 'PXC 480', 'GSP 300', 'GSP 370', 'GSP 500', 'GSP 600',
            'HD 25', 'HD 25 Light', 'HD 280 Pro', 'HD 300 Pro', 'HD 660S', 'HD 800S'
          ]
        },
        {
          nom: 'Beats', ordre: 6,
          modeles: [
            'Studio Pro', 'Studio 3', 'Studio 2', 'Solo 4', 'Solo 3', 'Solo Pro',
            'Fit Pro', 'Studio Buds', 'Studio Buds +', 'Powerbeats Pro',
            'Powerbeats 4', 'Powerbeats 3', 'Powerbeats 2', 'Flex', 'EP', 'Mixr', 'Pro'
          ]
        },
        {
          nom: 'Jabra', ordre: 7,
          modeles: [
            'Elite 85h', 'Elite 85t', 'Elite 75t', 'Elite 65t', 'Elite 65e',
            'Elite 45h', 'Elite 45e', 'Elite 25e', 'Elite 4 Active', 'Elite 5',
            'Elite 7 Pro', 'Elite 7 Active', 'Elite 8 Active', 'Elite 10',
            'Evolve2 65', 'Evolve2 85', 'Evolve2 Buds', 'Engage 55', 'Engage 65'
          ]
        },
        {
          nom: 'Bang & Olufsen', ordre: 8,
          modeles: [
            'Beoplay H95', 'Beoplay H9 3rd Gen', 'Beoplay H9i', 'Beoplay H8i',
            'Beoplay H4 2nd Gen', 'Beoplay HX', 'Beoplay Portal',
            'Beoplay EX', 'Beoplay EQ', 'Beoplay E8 3rd Gen', 'Beoplay E8 Sport',
            'Beoplay E6', 'Beoplay Earset'
          ]
        },
        {
          nom: 'AKG', ordre: 9,
          modeles: [
            'K371', 'K361', 'K275', 'K245', 'K175', 'K92', 'K72', 'K52',
            'N700NC M2', 'N700NC', 'Y500', 'Y50', 'Y45BT',
            'K712 Pro', 'K702', 'K701', 'K612 Pro', 'K240', 'K240 Studio'
          ]
        },
        {
          nom: 'Audio-Technica', ordre: 10,
          modeles: [
            'ATH-M50x', 'ATH-M50xBT2', 'ATH-M40x', 'ATH-M30x', 'ATH-M20x',
            'ATH-SR50BT', 'ATH-S220BT', 'ATH-S200BT', 'ATH-ANC900BT',
            'ATH-CKS50TW', 'ATH-CKR7TW', 'ATH-SPORT50BT', 'ATH-SPORT70BT',
            'ATH-AD500X', 'ATH-AD700X', 'ATH-AD900X', 'ATH-R70x', 'ATH-WP900'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 11,
          modeles: [
            'Mi Headphones Comfort', 'Mi Headphones Pro', 'Mi Super Bass',
            'Mi Bluetooth Headset', 'Redmi AirDots', 'Redmi AirDots 2',
            'Redmi AirDots 3', 'Redmi AirDots 3 Pro', 'Redmi Buds 4',
            'Redmi Buds 4 Pro', 'Redmi Buds 5', 'Xiaomi Buds 3',
            'Xiaomi Buds 4 Pro', 'Xiaomi Buds 5', 'Xiaomi FlipBuds Pro'
          ]
        },
        {
          nom: 'Huawei', ordre: 12,
          modeles: [
            'FreeBuds 5i', 'FreeBuds 5', 'FreeBuds 4i', 'FreeBuds 4',
            'FreeBuds Pro 3', 'FreeBuds Pro 2', 'FreeBuds Pro',
            'FreeBuds SE 2', 'FreeBuds SE', 'FreeBuds Studio', 'FreeLace Pro',
            'FreeLace', 'FreeLace Lite', 'FreeLace Pro 2'
          ]
        },
        {
          nom: 'Nothing', ordre: 13,
          modeles: ['Ear (1)', 'Ear (2)', 'Ear (a)', 'Ear (stick)', 'CMF Buds Pro', 'CMF Buds']
        },
        {
          nom: 'Soundcore', ordre: 14,
          modeles: [
            'Space One', 'Space A40', 'Space Q45', 'Space A45',
            'Life Q35', 'Life Q30', 'Life Q20', 'Life P3', 'Life P2',
            'Life A2 NC', 'Life A3i', 'Liberty 4', 'Liberty 4 NC', 'Liberty 3 Pro',
            'Liberty Air 2 Pro', 'Liberty Air 2', 'Life Dot 3i', 'Sport X10'
          ]
        },
        {
          nom: 'Skullcandy', ordre: 15,
          modeles: [
            'Crusher ANC 2', 'Crusher Evo', 'Crusher Wireless', 'Hesh ANC',
            'Hesh 3', 'Hesh Evo', 'Venue', 'Indy ANC', 'Indy Evo', 'Indy Fuel',
            'Sesh Evo', 'Sesh ANC', 'Jib True', 'Dime', 'Grind'
          ]
        },
        {
          nom: 'Générique', ordre: 16,
          modeles: [
            'Casque Bluetooth', 'Casque filaire', 'Casque gaming', 'Casque Hi-Fi',
            'Écouteurs Bluetooth', 'Écouteurs filaires', 'Écouteurs sport'
          ]
        }
      ]
    },

    // ============================================================
    // 10. AIRPOD
    // ============================================================
    {
      nom: 'AIRPOD',
      ordre: 10,
      marques: [
        {
          nom: 'Apple', ordre: 1,
          modeles: [
            'AirPods 1re gen', 'AirPods 2e gen', 'AirPods 3e gen',
            'AirPods Pro 1re gen', 'AirPods Pro 2e gen (Lightning)',
            'AirPods Pro 2e gen (USB-C)', 'AirPods Max', 'AirPods Pro 2 USB-C'
          ]
        },
        {
          nom: 'Samsung', ordre: 2,
          modeles: [
            'Galaxy Buds', 'Galaxy Buds+', 'Galaxy Buds Live', 'Galaxy Buds Pro',
            'Galaxy Buds 2', 'Galaxy Buds 2 Pro', 'Galaxy Buds FE',
            'Galaxy Buds 3', 'Galaxy Buds 3 Pro'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 3,
          modeles: [
            'Redmi Buds 3', 'Redmi Buds 3 Lite', 'Redmi Buds 3 Pro',
            'Redmi Buds 4', 'Redmi Buds 4 Lite', 'Redmi Buds 4 Active',
            'Redmi Buds 4 Pro', 'Redmi Buds 5', 'Redmi Buds 5 Pro',
            'Xiaomi Buds 3', 'Xiaomi Buds 3 Pro', 'Xiaomi Buds 4',
            'Xiaomi Buds 4 Pro', 'Xiaomi Buds 5', 'Xiaomi FlipBuds Pro'
          ]
        },
        {
          nom: 'Huawei', ordre: 4,
          modeles: [
            'FreeBuds 3', 'FreeBuds 3i', 'FreeBuds 4', 'FreeBuds 4i',
            'FreeBuds 5', 'FreeBuds 5i', 'FreeBuds 6i', 'FreeBuds Pro',
            'FreeBuds Pro 2', 'FreeBuds Pro 3', 'FreeBuds SE', 'FreeBuds SE 2',
            'FreeBuds Lipstick'
          ]
        },
        {
          nom: 'Oppo', ordre: 5,
          modeles: [
            'Enco Air', 'Enco Air 2', 'Enco Air 2 Pro', 'Enco Air 3',
            'Enco Air 3 Pro', 'Enco Buds', 'Enco Buds 2', 'Enco Free 2',
            'Enco Free 3', 'Enco W31', 'Enco W51', 'Enco X', 'Enco X2'
          ]
        },
        {
          nom: 'Realme', ordre: 6,
          modeles: [
            'Buds Air', 'Buds Air 2', 'Buds Air 2 Neo', 'Buds Air 3',
            'Buds Air 3 Neo', 'Buds Air 5', 'Buds Air 5 Pro', 'Buds Air Pro',
            'Buds Air Pro 2', 'Buds T100', 'Buds T110', 'Buds T300',
            'Buds Q', 'Buds Q2', 'Buds Q2s', 'Buds Wireless', 'Buds Wireless Pro'
          ]
        },
        {
          nom: 'Honor', ordre: 7,
          modeles: [
            'Earbuds 2 SE', 'Earbuds 3 Pro', 'Earbuds X3', 'Earbuds X5',
            'Earbuds X5 Pro', 'Choice Earbuds X3', 'Choice Earbuds X5',
            'Choice Earbuds X5 Pro', 'Earbuds X6'
          ]
        },
        {
          nom: 'Nothing', ordre: 8,
          modeles: [
            'Ear (1)', 'Ear (2)', 'Ear (a)', 'Ear (stick)',
            'CMF Buds', 'CMF Buds Pro', 'CMF Buds Pro 2', 'Nothing Ear (open)'
          ]
        },
        {
          nom: 'OnePlus', ordre: 9,
          modeles: [
            'Buds', 'Buds Z', 'Buds Z2', 'Buds N', 'Buds Pro', 'Buds Pro 2',
            'Buds Pro 3', 'Nord Buds', 'Nord Buds 2', 'Nord Buds 2r',
            'Nord Buds 3 Pro', 'Nord Buds CE'
          ]
        },
        {
          nom: 'Beats', ordre: 10,
          modeles: [
            'Studio Buds', 'Studio Buds +', 'Fit Pro', 'Powerbeats Pro',
            'Powerbeats Pro 2', 'Beats Flex', 'Beats X'
          ]
        },
        {
          nom: 'Soundcore', ordre: 11,
          modeles: [
            'Life P3', 'Life P2', 'Life P2 Mini', 'Life A2 NC', 'Life A3i',
            'Life Dot 3i', 'Life Note 3', 'Liberty 3 Pro', 'Liberty 4',
            'Liberty 4 NC', 'Liberty Air 2', 'Liberty Air 2 Pro', 'Sport X10',
            'Space A40', 'Space A45'
          ]
        },
        {
          nom: 'JBL', ordre: 12,
          modeles: [
            'Tune Buds', 'Tune Beam', 'Tune Flex', 'Wave Buds', 'Wave Beam',
            'Wave Flex', 'Live Pro 2 TWS', 'Live Free 2 TWS',
            'Reflect Mini NC TWS', 'Reflect Aero', 'Vibe 100', 'Vibe 200',
            'Vibe 300', 'Endurance Peak 3', 'Under Armour Project Rock'
          ]
        },
        {
          nom: 'Jabra', ordre: 13,
          modeles: [
            'Elite 3', 'Elite 4 Active', 'Elite 5', 'Elite 7 Active',
            'Elite 7 Pro', 'Elite 8 Active', 'Elite 10', 'Elite 85t',
            'Elite Active 75t', 'Elite Active 65t', 'Elite 65t'
          ]
        },
        {
          nom: 'Sony', ordre: 14,
          modeles: [
            'WF-1000XM5', 'WF-1000XM4', 'WF-1000XM3', 'WF-C700N', 'WF-C500',
            'WF-SP800N', 'WF-SP700N', 'WF-XB700', 'LinkBuds', 'LinkBuds S',
            'LinkBuds Fit', 'LinkBuds Open'
          ]
        },
        {
          nom: 'Générique', ordre: 15,
          modeles: [
            'Écouteurs TWS', 'Écouteurs TWS ANC', 'Écouteurs TWS Sport',
            'Écouteurs TWS Gaming'
          ]
        }
      ]
    },

    // ============================================================
    // 11. Chargeur Pc
    // ============================================================
    {
      nom: 'Chargeur Pc',
      ordre: 11,
      marques: [
        {
          nom: 'HP', ordre: 1,
          modeles: [
            '45W USB-C', '45W Smart AC', '65W USB-C', '65W Smart AC',
            '65W USB-C (slim)', '90W USB-C', '90W Smart AC', '90W (slim tip)',
            '120W Smart AC', '150W Smart AC', '180W Smart AC', '200W Smart AC',
            '230W Smart AC'
          ]
        },
        {
          nom: 'Dell', ordre: 2,
          modeles: [
            '45W Type-C', '65W Type-C', '65W Barrel', '90W Type-C', '90W Barrel',
            '130W Type-C', '130W Barrel', '180W Barrel', '240W Barrel',
            'WD15 Dock 130W', 'WD19 Dock 180W', 'WD22TB4 Dock 180W'
          ]
        },
        {
          nom: 'Lenovo', ordre: 3,
          modeles: [
            '45W USB-C', '65W USB-C', '65W Slim Tip', '90W USB-C', '90W Slim Tip',
            '135W Slim Tip', '170W Slim Tip', '230W Slim Tip',
            'ThinkPad 65W USB-C', 'ThinkPad 90W USB-C', 'ThinkPad 135W Slim'
          ]
        },
        {
          nom: 'Apple', ordre: 4,
          modeles: [
            '29W USB-C', '30W USB-C', '45W MagSafe 2', '60W MagSafe 2',
            '61W USB-C', '85W MagSafe 2', '87W USB-C', '96W USB-C',
            '140W USB-C (MagSafe 3)', '67W USB-C', '70W USB-C'
          ]
        },
        {
          nom: 'Asus', ordre: 5,
          modeles: [
            '45W', '65W', '90W', '120W', '150W', '180W', '200W', '240W',
            'ROG 240W', 'ROG 280W', 'ROG 330W'
          ]
        },
        {
          nom: 'Acer', ordre: 6,
          modeles: ['45W', '65W', '90W', '135W', '180W', '230W', 'Acer 90W USB-C']
        },
        {
          nom: 'MSI', ordre: 7,
          modeles: ['65W', '90W', '120W', '150W', '180W', '230W', '280W']
        },
        {
          nom: 'Samsung', ordre: 8,
          modeles: ['45W USB-C', '65W USB-C', '90W USB-C', 'Galaxy Book 65W']
        },
        {
          nom: 'Sony', ordre: 9,
          modeles: ['45W', '65W', '90W', 'Vaio 90W', 'Sony 120W']
        },
        {
          nom: 'Toshiba', ordre: 10,
          modeles: ['45W', '65W', '90W', '120W', 'Toshiba 90W Barrel']
        },
        {
          nom: 'Fujitsu', ordre: 11,
          modeles: ['45W', '65W', '90W', 'Fujitsu 80W']
        },
        {
          nom: 'Microsoft', ordre: 12,
          modeles: ['Surface 24W', 'Surface 36W', 'Surface 44W', 'Surface 65W', 'Surface 102W', 'Surface 127W']
        },
        {
          nom: 'Razer', ordre: 13,
          modeles: ['Razer 65W USB-C', 'Razer 100W USB-C', 'Razer 230W']
        },
        {
          nom: 'Gigabyte', ordre: 14,
          modeles: ['Gigabyte 65W', 'Gigabyte 120W', 'Gigabyte 180W', 'Gigabyte 230W']
        },
        {
          nom: 'Universel', ordre: 15,
          modeles: [
            'Universel 45W Multi-tip', 'Universel 65W Multi-tip',
            'Universel 90W Multi-tip', 'Universel 120W Multi-tip',
            'Universel 90W USB-C', 'Universel 100W GaN', 'Universel 65W GaN'
          ]
        },
        {
          nom: 'Générique', ordre: 16,
          modeles: [
            'Chargeur 45W', 'Chargeur 65W', 'Chargeur 90W', 'Chargeur 120W',
            'Chargeur 150W', 'Chargeur 180W'
          ]
        }
      ]
    },

    // ============================================================
    // 12. Smartwatch
    // ============================================================
    {
      nom: 'Smartwatch',
      ordre: 12,
      marques: [
        {
          nom: 'Apple', ordre: 1,
          modeles: [
            'Watch Series 9 (41mm)', 'Watch Series 9 (45mm)',
            'Watch Series 8 (41mm)', 'Watch Series 8 (45mm)',
            'Watch Series 7 (41mm)', 'Watch Series 7 (45mm)',
            'Watch Series 6 (40mm)', 'Watch Series 6 (44mm)',
            'Watch Series 5', 'Watch Series 4', 'Watch Series 3',
            'Watch Ultra 2', 'Watch Ultra', 'Watch SE (2e gen)', 'Watch SE (1re gen)'
          ]
        },
        {
          nom: 'Samsung', ordre: 2,
          modeles: [
            'Galaxy Watch 6 (40mm)', 'Galaxy Watch 6 (44mm)',
            'Galaxy Watch 6 Classic (43mm)', 'Galaxy Watch 6 Classic (47mm)',
            'Galaxy Watch 5 (40mm)', 'Galaxy Watch 5 (44mm)',
            'Galaxy Watch 5 Pro', 'Galaxy Watch 4 (40mm)', 'Galaxy Watch 4 (44mm)',
            'Galaxy Watch 4 Classic', 'Galaxy Watch 3', 'Galaxy Watch Active 2',
            'Galaxy Watch Active', 'Galaxy Watch (1re gen)',
            'Galaxy Watch FE', 'Galaxy Watch Ultra'
          ]
        },
        {
          nom: 'Huawei', ordre: 3,
          modeles: [
            'Watch GT 4 (41mm)', 'Watch GT 4 (46mm)', 'Watch GT 3 Pro',
            'Watch GT 3 (42mm)', 'Watch GT 3 (46mm)', 'Watch GT 2 Pro',
            'Watch GT 2', 'Watch GT 2e', 'Watch GT', 'Watch Fit 3', 'Watch Fit 2',
            'Watch Fit', 'Watch Fit SE', 'Watch 4 Pro', 'Watch 4', 'Watch 3 Pro',
            'Watch 3', 'Watch 2', 'Watch Ultimate', 'Watch D', 'Watch Buds'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 4,
          modeles: [
            'Watch S3', 'Watch S2', 'Watch S1 Pro', 'Watch S1 Active', 'Watch S1',
            'Watch 2 Pro', 'Watch 2', 'Watch Lite', 'Watch Color 2',
            'Watch Color Sport', 'Redmi Watch 4', 'Redmi Watch 3',
            'Redmi Watch 3 Active', 'Redmi Watch 2', 'Redmi Watch 2 Lite',
            'Mi Watch Revolve', 'Mi Watch Revolve Active', 'Xiaomi Watch 2 Pro LTE'
          ]
        },
        {
          nom: 'Garmin', ordre: 5,
          modeles: [
            'Forerunner 965', 'Forerunner 955', 'Forerunner 945', 'Forerunner 745',
            'Forerunner 265', 'Forerunner 255', 'Forerunner 165', 'Forerunner 55',
            'Forerunner 45', 'Forerunner 35',
            'Fenix 7X Pro', 'Fenix 7X', 'Fenix 7 Pro', 'Fenix 7', 'Fenix 7S',
            'Fenix 6X Pro', 'Fenix 6', 'Fenix 5X', 'Fenix 5',
            'Venu 3', 'Venu 3S', 'Venu 2 Plus', 'Venu 2', 'Venu Sq 2',
            'Vivoactive 5', 'Vivoactive 4', 'Vivomove Trend', 'Vivomove Sport',
            'Instinct 2X Solar', 'Instinct 2', 'Instinct Crossover',
            'Lily 2', 'Lily', 'Epix Pro', 'Epix Gen 2', 'Enduro 2',
            'Approach S70', 'Approach S62', 'Approach S42', 'MARQ Series'
          ]
        },
        {
          nom: 'Amazfit', ordre: 6,
          modeles: [
            'GTR 4', 'GTR 4 Limited', 'GTR 3', 'GTR 3 Pro', 'GTR 2',
            'GTS 4', 'GTS 4 Mini', 'GTS 3', 'GTS 2', 'GTS 2 Mini', 'GTS 2e',
            'T-Rex 3', 'T-Rex 2', 'T-Rex Pro', 'T-Rex',
            'Bip 5', 'Bip 4', 'Bip 3', 'Bip 3 Pro', 'Bip U', 'Bip U Pro',
            'Bip S', 'Bip S Lite', 'Bip Lite',
            'GTS 4 Mini', 'Active', 'Band 7', 'Cheetah Pro', 'Falcon'
          ]
        },
        {
          nom: 'Fitbit', ordre: 7,
          modeles: [
            'Sense 2', 'Sense', 'Versa 4', 'Versa 3', 'Versa 2', 'Versa',
            'Charge 6', 'Charge 5', 'Charge 4', 'Charge 3', 'Charge 2',
            'Inspire 3', 'Inspire 2', 'Inspire HR', 'Inspire',
            'Luxe', 'Ace 3', 'Ace 2', 'Ionic', 'Blaze', 'Alta HR', 'Alta',
            'Surge', 'Flex 2', 'One'
          ]
        },
        {
          nom: 'Huawei', ordre: 8,
          modeles: ['Watch GT Cyber', 'Watch GT Runner', 'Watch GT 2 Pro ECG', 'Watch Fit 4']
        },
        {
          nom: 'Honor', ordre: 9,
          modeles: [
            'Watch 4', 'Watch 4 Pro', 'Watch GS 3', 'Watch GS Pro',
            'Watch ES', 'Watch Magic 2', 'Watch Magic', 'Watch Dream',
            'Band 8', 'Band 7', 'Band 6', 'Band 5'
          ]
        },
        {
          nom: 'Realme', ordre: 10,
          modeles: [
            'Watch 5', 'Watch 5 Pro', 'Watch 4', 'Watch 3', 'Watch 3 Pro',
            'Watch 2', 'Watch 2 Pro', 'Watch S', 'Watch S Pro', 'Watch S Master',
            'Watch T1', 'Band 2', 'Band 5'
          ]
        },
        {
          nom: 'Oppo', ordre: 11,
          modeles: [
            'Watch 4 Pro', 'Watch 4', 'Watch 3', 'Watch 3 Pro', 'Watch 2',
            'Watch 2 Pro', 'Watch 41mm', 'Watch 46mm', 'Watch SE',
            'Watch Free', 'Band 2'
          ]
        },
        {
          nom: 'OnePlus', ordre: 12,
          modeles: ['Watch 2', 'Watch 2R', 'Watch', 'Nord Watch']
        },
        {
          nom: 'Google', ordre: 13,
          modeles: ['Pixel Watch 2', 'Pixel Watch']
        },
        {
          nom: 'Ticwatch', ordre: 14,
          modeles: [
            'Pro 5', 'Pro 3 Ultra', 'Pro 3', 'Pro 2020', 'E3',
            'C2', 'S2', 'GTX'
          ]
        },
        {
          nom: 'Fossil', ordre: 15,
          modeles: [
            'Gen 6', 'Gen 6 Wellness', 'Gen 5 LTE', 'Gen 5E', 'Gen 5', 'Gen 4',
            'Sport', 'Hybrid HR', 'Hybrid Smartwatch'
          ]
        },
        {
          nom: 'Générique', ordre: 16,
          modeles: [
            'Montre connectée', 'Montre connectée GPS', 'Montre connectée AMOLED',
            'Bracelet connecté', 'Bracelet sport'
          ]
        }
      ]
    },

    // ============================================================
    // 13. portatif
    // ============================================================
    {
      nom: 'portatif',
      ordre: 13,
      marques: [
        { nom: 'Générique', ordre: 1,
          modeles: ['Portatif Standard', 'Portatif Mini', 'Portatif Pro', 'Portatif XL'] }
      ]
    },

    // ============================================================
    // 14. Recepteur
    // ============================================================
    {
      nom: 'Recepteur',
      ordre: 14,
      marques: [
        {
          nom: 'Strong', ordre: 1,
          modeles: [
            'SRT 4930', 'SRT 4950', 'SRT 4955', 'SRT 7404', 'SRT 7504',
            'SRT 4900', 'SRT 4920', 'SRT 4820', 'SRT 4800'
          ]
        },
        {
          nom: 'Starsat', ordre: 2,
          modeles: [
            'SR-2000HD Hyper', 'SR-90000 Extreme', 'SR-8800HD', 'SR-7700HD',
            'SR-8080HD', 'SR-2020HD', 'SR-7474HD', 'SR-T14 Extreme', 'SR-T13',
            'SR-T140', 'SR-4000HD'
          ]
        },
        {
          nom: 'Echolink', ordre: 3,
          modeles: ['EL-700', 'EL-900', 'EL-1000', 'EL-2000', 'EL-505']
        },
        {
          nom: 'Geant', ordre: 4,
          modeles: ['GN-2000 HD', 'GN-7000 HD', 'GN-8800', 'GN-9500', 'GN-2500']
        },
        {
          nom: 'Vision', ordre: 5,
          modeles: ['Vision HD', 'Vision X3', 'Vision X4', 'Vision 4K', 'Vision V8']
        },
        {
          nom: 'Redline', ordre: 6,
          modeles: ['Redline 4K', 'Redline HD', 'Redline Mini']
        },
        {
          nom: 'Générique', ordre: 7,
          modeles: ['Recepteur HD', 'Recepteur 4K', 'Recepteur Mini', 'Recepteur Android']
        }
      ]
    },

    // ============================================================
    // 15. recepteur bein
    // ============================================================
    {
      nom: 'recepteur bein',
      ordre: 15,
      marques: [
        {
          nom: 'beIN', ordre: 1,
          modeles: [
            'beIN 4K', 'beIN HD', 'beIN Mini', 'beIN Connect Box',
            'beIN Decoder HD', 'beIN Decoder 4K'
          ]
        },
        {
          nom: 'Générique', ordre: 2,
          modeles: [
            'Recepteur beIN HD', 'Recepteur beIN 4K', 'Recepteur beIN Mini'
          ]
        }
      ]
    },

    // ============================================================
    // 16. camera de surveillance
    // ============================================================
    {
      nom: 'camera de surveillance',
      ordre: 16,
      marques: [
        {
          nom: 'Hikvision', ordre: 1,
          modeles: [
            'DS-2CD1023G0E-I', 'DS-2CD1043G0-I', 'DS-2CD2043G0-I',
            'DS-2CD2143G0-IS', 'DS-2CD1123G0E-I', 'DS-2CD1143G0-I',
            'DS-2CD2023G0-I', 'DS-2CD2123G0-IS', 'DS-2CD1323G0E-I',
            'DS-2CD1343G0-I', 'DS-2CD2343G0-I', 'DS-2CD2386G2-I',
            'DS-2DE4425IW-DE', 'DS-2DE4A425IW-DE', 'DS-2CE16D0T-IR',
            'DS-2CE56D0T-IR', 'iDS-2CD7A46G0', 'DS-2CD2T47G1-L'
          ]
        },
        {
          nom: 'Dahua', ordre: 2,
          modeles: [
            'IPC-HFW1230S', 'IPC-HFW1230S1', 'IPC-HFW2230S-S2',
            'IPC-HFW2231S-S2', 'IPC-HFW2431T-AS', 'IPC-HFW3241E-AS',
            'IPC-HDW1230S', 'IPC-HDW1230S1', 'IPC-HDW2230T-AS',
            'IPC-HDW2231T-AS', 'IPC-HDW2431T-AS', 'IPC-HDW3241T-ZAS',
            'IPC-HDBW1230E', 'IPC-HDBW2231E-S2', 'IPC-HDBW2431E-S-S2',
            'SD22204DB-GNY', 'SD29204T-GN-W', 'NVR2104HS-S3',
            'NVR2108HS-S3', 'NVR4116HS-4KS3'
          ]
        },
        {
          nom: 'TP-Link', ordre: 3,
          modeles: [
            'Tapo C200', 'Tapo C210', 'Tapo C220', 'Tapo C225', 'Tapo C310',
            'Tapo C320WS', 'Tapo C325WB', 'Tapo C410', 'Tapo C420',
            'Tapo C500', 'Tapo C510W', 'Tapo C520WS',
            'Tapo TC60', 'Tapo TC65', 'Tapo TC70', 'Tapo TC85',
            'Kasa KC100', 'Kasa KC200', 'Kasa KC300', 'Kasa KC400'
          ]
        },
        {
          nom: 'Xiaomi', ordre: 4,
          modeles: [
            'Mi Camera 2K', 'Mi Camera 2K Pro', 'Mi 360° 1080p',
            'Mi 360° 2K', 'Mi 360° 2K Pro', 'Mi Home Security Camera Basic 1080p',
            'Mi Outdoor 1080p', 'Mi Outdoor 2K', 'Xiaomi Smart Camera C200',
            'Xiaomi Smart Camera C300', 'Xiaomi Smart Camera C400',
            'Xiaomi Outdoor Camera AW200', 'Xiaomi Outdoor Camera AW300'
          ]
        },
        {
          nom: 'Ezviz', ordre: 5,
          modeles: [
            'C6N', 'C6W', 'C6CN', 'C6WI', 'C3W', 'C3WN', 'C3X', 'C3N',
            'C1C', 'C1T', 'C1HC', 'C2C', 'C2HC', 'C4W', 'C4N',
            'H6', 'H6C', 'H3', 'H3C', 'CP1', 'CB2', 'CB3'
          ]
        },
        {
          nom: 'Reolink', ordre: 6,
          modeles: [
            'RLC-410', 'RLC-410W', 'RLC-510A', 'RLC-510WA', 'RLC-810A',
            'RLC-810WA', 'RLC-811A', 'RLC-820A', 'RLC-823A', 'RLC-1220A',
            'E1 Outdoor', 'E1 Pro', 'E1 Zoom', 'Argus 2', 'Argus 3', 'Argus 3 Pro',
            'Argus PT', 'Argus Eco', 'Argus PT Ultra', 'Go PT Plus'
          ]
        },
        {
          nom: 'Imou', ordre: 7,
          modeles: [
            'Ranger 2', 'Ranger 2C', 'Ranger Pro', 'Bullet 2', 'Bullet 2C',
            'Bullet 2E', 'Bullet 3', 'Cube 4MP', 'Cube 1080p',
            'Cruiser 2', 'Cruiser 2C', 'Cruiser Dual 2', 'Dome Lite',
            'Cell 2', 'Cell Go', 'DB11', 'DB61'
          ]
        },
        {
          nom: 'Swann', ordre: 8,
          modeles: [
            'HD 1080p', 'Pro 4K', 'Master 4K', 'Security Camera 4K',
            'SWNVK-885808', 'SWDVK-445808', 'SWDVK-846804'
          ]
        },
        {
          nom: 'Ring', ordre: 9,
          modeles: [
            'Video Doorbell Wired', 'Video Doorbell 4', 'Video Doorbell Pro 2',
            'Stick Up Cam Battery', 'Stick Up Cam Pro', 'Floodlight Cam Wired Pro',
            'Floodlight Cam Plus', 'Spotlight Cam Plus', 'Indoor Cam (2nd Gen)',
            'Pan Tilt Indoor Cam', 'Spotlight Cam Battery'
          ]
        },
        {
          nom: 'Arlo', ordre: 10,
          modeles: [
            'Pro 5', 'Pro 5S 2K', 'Pro 4', 'Pro 3', 'Pro 2', 'Essential',
            'Essential Spotlight', 'Ultra 2', 'Ultra', 'Video Doorbell',
            'Floodlight Camera', 'Go 2'
          ]
        },
        {
          nom: 'Bosch', ordre: 11,
          modeles: [
            'FLEXIDOME IP 3000i', 'FLEXIDOME IP 4000i', 'FLEXIDOME IP 5000i',
            'DINION IP 3000i', 'DINION IP 4000i', 'DINION IP 5000i',
            'AUTODOME IP 5000i', 'AUTODOME IP 7000i'
          ]
        },
        {
          nom: 'Axis', ordre: 12,
          modeles: [
            'M3045-V', 'M3046-V', 'M3057-PLVE', 'M3067-P', 'P1364', 'P1365',
            'P1375', 'P1455-LE', 'P3245-LVE', 'P3265-LVE', 'Q3517-LV'
          ]
        },
        {
          nom: 'Générique', ordre: 13,
          modeles: [
            'Caméra IP 1080p', 'Caméra IP 2K', 'Caméra IP 4K',
            'Caméra WiFi intérieure', 'Caméra WiFi extérieure',
            'Caméra PTZ', 'Caméra Dôme', 'Caméra Bullet'
          ]
        }
      ]
    },

    // ============================================================
    // 17. autre
    // ============================================================
    {
      nom: 'autre',
      ordre: 17,
      marques: [
        {
          nom: 'Générique', ordre: 1,
          modeles: [
            'Autre', 'Divers', 'Non spécifié', 'Accessoire', 'Pièce détachée'
          ]
        }
      ]
    }
  ]
};