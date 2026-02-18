#!/usr/bin/env node
/**
 * Extracts PO data from PDFs and outputs Suppliers CSV format.
 * Run: node scripts/extract-pos-to-suppliers.js
 * - Extracts line items from PO PDFs, logs to scripts/logs/
 * - Merges with manual data; uses extracted items instead of "Various items" placeholders
 */

const fs = require('fs');
const path = require('path');

const PO_DIRS = [
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP24120518-MMR JX Metals Slitting Machine Panel Rehab - COMP/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25010029-AVR Aboitiz TMI Nasipit RTU Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25060301-RTR True Temp Linden Suites BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25070317-TJC True Temp Supply of VFD/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25080381-TJC Cardinal Santos Operating Room BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25080415-NSG ADI Integration of 3 Vertiv UPS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25100500-TJC RPAT Additionals/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25050226-JMO URC Cal 2 Schaaf 2 Machine Elec Panel Rehab/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25070344-CBG URC BCFG-Cavite-CCTV Power Panel Installation/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25070349-CBG URC-Cavite-PPM2A Panel Installation/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25080414-CBG Unilab-Mandaluyong-Replacement of MDP Panel at FLEX/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/DS Projects 2024/CMRP24040105-EIS No 5 Upper East Avenue BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24060234-RJR ATTSC Brent School Chiller BMS Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24060224-JMO URC Cavite Dynamite SCADA PLC Upgrade/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24050176-RJR LBI MDI Compressor Rack Conversion/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP23100347-EIS Unilab Glatt Panel Retrofitting/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24080301-RJR STMicro PM Installation and FMCS Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2026 - Orders/SE Project 2026/CMRP25060265B-CBG URC BCFG-Calamba 2-Installation of Power Meter/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2026 - Orders/SE Project 2026/CMRP25070326-CBG URC UCP AIG-Pasig-Rectification of Auxiliary at Concrete Silo/P.O',
];

// Manual data extracted from PDFs - Suppliers CSV format
const ROWS = [
  // CMRP24120518 - JJLAPP
  ['JJLAPP (P) INC.','Racquel Quines','','+63 939 503 2928','5/F Orion Building 11th Ave Corner 38th St BGC Taguig City','30 days PDC','Cable/Panel materials','','','Various items per CMRP24120518-EPO001','lot',0,'2025-01-01'],
  // CMRP24120518 - KAIROS
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Electrical materials','','','Various items per CMRP24120518-EPO002','lot',0,'2025-01-01'],
  // CMRP25010029 - MTECH
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','CPU 1515-2 PN','6ES7515-2AN03-0AB0','Siemens','SIMATIC S7-1500 CPU 1515-2 PN 1 MB program 4.5 MB data memory PROFINET IRT with 2-port switch 6 ns bit performance','pcs',131204.79,'2025-02-28'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','Industrial Ethernet Switch','6GK7543-1MX00-0XE0','Siemens','Industrial Ethernet switch 10/100/1000 Mbit/s for S7-1500 VPN and Firewall support','pcs',166099.40,'2025-02-28'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','SITOP PSU100S','6EP1334-2BA20','Siemens','SITOP PSU100S stabilized power supply 24V DC 10A 240W 120/230V AC input 90% efficiency power boost 150%','pcs',15126.30,'2025-02-28'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','SCALANCE XB008','6GK5008-0BA10-1AB2','Siemens','SCALANCE XB008 unmanaged Industrial Ethernet switch 8x RJ45 10/100 Mbit/s 24V AC/DC IP20 PROFINET class A','pcs',11900.13,'2025-02-28'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','Mounting Rail','6ES7590-1AB60-0AA0','Siemens','SIMATIC S7-1500 mounting rail 160 mm incl grounding screw integrated DIN rail for terminals and circuit breakers','pcs',966.43,'2025-02-28'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','Memory Card S7','6ES7954-8LL03-0AA0','Siemens','SIMATIC S7 Memory Card 256 MB Flash for S7-1200/1500 CPU 3.3V program and configuration storage','pcs',14756.54,'2025-02-28'],
  // CMRP25010029 - DOTX
  ['DOT[X].SOLUTIONS','Julius King Cuajao','sales@dotxsolutions.io','+63 915 565 2769','','30% DP 70% Progress billing','Engineering Services - Aboitiz M2 RTU Integration Nasipit','','DOTX','Project Kickoff Technical Assessment Offsite Pre-engineering Project Supervision RTU Configuration PLC Data Collection DNP3 Signal Configuration FAT SAT Training Documentation','lot',675580.90,'2025-02-28'],
  // CMRP25010029 - IAWORX EPO003
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','SCALANCE SC622-2C','6GK5622-2GS00-2AC2','Siemens','SCALANCE SC622-2C Industrial Security Appliance firewall NAT/NAPT network separation PROFIsafe 2x combo 10/100/1000 Mbit/s RJ45/SFP SINEMA RC connection','pcs',73214.29,'2025-06-19'],
  // CMRP25010029 - ELESCOM
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Tibox 800mmHx800mmWx300mmD','','','Tibox 800mmHx800mmWx300mmD','pc',11033.04,'2025-06-27'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Din rail','','','Din rail','pcs',125.00,'2025-06-27'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Cable Gland 1/2 inch','','','Cable Gland 1/2 inch','pcs',33.04,'2025-06-27'],
  // CMRP25010029 - FEPCOR
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB MCB S202-C100','S202-C100','ABB','ABB MCB S202-C100','pc',2642.86,'2025-06-27'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB MCB S202-C6','S202-C6','ABB','ABB MCB S202-C6','pcs',501.79,'2025-06-27'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB MCB S201-C2','S201-C2','ABB','ABB MCB S201-C2','pcs',463.39,'2025-06-27'],
  // CMRP25010029 - SHOPEE
  ['SHOPEE PHILIPPINES','','','','Seven/NEO 37th Floor 5th Ave Taguig','Dianne CC','Din rail type outlet 10~16A 250VAC','','','AC30 Socket 10~16A 250VAC','pcs',100.00,'2025-06-27'],
  // CMRP25010029 - IAWORX EPO007
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','CPU 1515-2 PN','6ES7515-2AN03-0AB0','Siemens','SIMATIC S7-1500 CPU 1515-2 PN 1 MB program 4.5 MB data memory PROFINET IRT with 2-port switch','pc',142641.00,'2025-08-08'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','SITOP PSU100S','6EP1334-2BA20','Siemens','SITOP PSU100S 24V DC 10A 240W 120/230V AC input stabilized power supply','pc',15952.00,'2025-08-08'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','SCALANCE XB008','6GK5008-0BA10-1AB2','Siemens','SCALANCE XB008 unmanaged Industrial Ethernet switch 8x RJ45 10/100 Mbit/s 24V AC/DC','pc',12550.00,'2025-08-08'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','Mounting Rail','6ES7590-1AB60-0AA0','Siemens','SIMATIC S7-1500 mounting rail 160 mm incl grounding screw integrated DIN rail for terminals','pc',1054.00,'2025-08-08'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','Memory Card S7','6ES7954-8LL03-0AA0','Siemens','SIMATIC S7 Memory Card 256 MB Flash for S7-1200/1500 CPU 3.3V','pc',17703.00,'2025-08-08'],
  // CMRP25010029 - FALCONHUB
  ['FALCONHUB LOGISTICS INC.','Elgin Maunahan','operations@falconhub.net.ph','+632 894 5232','4F JBM Bldg. 8750 San Pedro St. San Antonio Valley 2 San Isidro Paranaque City','30 days','Airfreight Charge','','','Airfreight Charge Php 105.00 x 141kgs','pc',14805.00,'2025-10-06'],
  ['FALCONHUB LOGISTICS INC.','Elgin Maunahan','operations@falconhub.net.ph','+632 894 5232','4F JBM Bldg. 8750 San Pedro St. San Antonio Valley 2 San Isidro Paranaque City','30 days','Delivery Pickup','','','Delivery/Pickup Nasipit Agusan Del Norte','pc',7000.00,'2025-10-06'],
  ['FALCONHUB LOGISTICS INC.','Elgin Maunahan','operations@falconhub.net.ph','+632 894 5232','4F JBM Bldg. 8750 San Pedro St. San Antonio Valley 2 San Isidro Paranaque City','30 days','Freight Charges','','','Freight Charges Nasipit Agusan Del Norte','lot',65000.00,'2026-01-05'],
  // CMRP25050226 - ELESCOM, TAYAN, DCPI
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP25050226-EPO001 EPO004','lot',0,'2025-01-01'],
  ['TAYAN ELECTRICAL & INDUSTRIAL COMPONENTS ENTERPRISES','Jonathan Ang','yokoyamaelectric@gmail.com','8725-5313','#26 E. Jacinto St. Little Baguio San Juan City','Fund transfer','Electrical materials','','','Various items per CMRP25050226-EPO002','lot',0,'2025-01-01'],
  ['DCPI Distribution & Control Products, Inc.','Harold V. Cortez','','+63 917-6348576','74 P. Cruz Street San Jose Mandaluyong City','60 days PDC','Control products','','','Various items per CMRP25050226-EPO003','lot',0,'2025-01-01'],
  // CMRP25070344 - RAS, AMTI, ELESCOM, KAIROS, FEPCOR, NETPAC, AVESCO, HYPERTECH
  ['RAS POWER SYSTEM CORPORATION','Jojo Abordo','raspowersystem@gmail.com','09778420577','2C APECC Bldg. Meaddowood Ave. P.F Espiritu V. Bacoor Cavite','30 days','CCTV power panel materials','','','Various items per CMRP25070344-EPO001','lot',0,'2025-01-01'],
  ['ACCENT MICRO TECHNOLOGIES, INC.','Alma Dela Cruz','Alma.Delacruz@amti.com.ph','(02) 718-7388','8th Floor PSE Center East Tower Exchange Road Ortigas Center Pasig City','60 days PDC','IT/AV equipment','','','Various items per CMRP25070344-EPO002','lot',0,'2025-01-01'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP25070344-EPO003','lot',0,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Electrical materials','','','Various items per CMRP25070344-EPO004','lot',0,'2025-01-01'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','Electrical materials','','','Various items per CMRP25070344-EPO005 EPO009','lot',0,'2025-01-01'],
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','Networking/Cabling','','','Various items per CMRP25070344-EPO006','lot',0,'2025-01-01'],
  ['AVESCO Marketing Corp','','sales@avesco.com.ph','(02) 8912-8881','810 Aurora Blvd. cor. Yale St. Cubao Quezon City','','Electrical materials','','','Various items per CMRP25070344-EPO007','lot',0,'2025-01-01'],
  ['HYPERTECH WIRE AND CABLE INC.','Lanie Yu','','+63 9177215888','Bldg. B, #8001 HWC Compound MacArthur Highway Brgy. Tuktukan Guiguinto Bulacan','','Wire and cable','','','Various items per CMRP25070344-EPO008','lot',0,'2025-01-01'],
  // CMRP25070349 - RAS, ELESCOM, FEPCOR
  ['RAS POWER SYSTEM CORPORATION','Jojo Abordo','raspowersystem@gmail.com','09778420577','2C APECC Bldg. Meaddowood Ave. P.F Espiritu V. Bacoor Cavite','30 days','Panel installation materials','','','Various items per CMRP25070349-EPO001','lot',0,'2025-01-01'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP25070349-EPO002','lot',0,'2025-01-01'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','Electrical materials','','','Various items per CMRP25070349-EPO003','lot',0,'2025-01-01'],
  // CMRP25080414 - ELECTROTRADE, KAIROS, ELESCOM
  ['ELECTROTRADE INDUSTRIES INC.','','','','','','MDP panel materials','','','Various items per CMRP25080414-EPO001','lot',0,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Electrical materials','','','Various items per CMRP25080414-EPO002','lot',0,'2025-01-01'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP25080414-EPO003','lot',0,'2025-01-01'],
  // CMRP24060234 - KAIROS, AC DEANG, ELESCOM, AMTI, NETPAC, FEPCOR, AWS, HIGHPOINT, PRISMA, IMAXX, MTECH, SHOTOKU, ELECTRUM, DIFSYS
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Chiller BMS materials','','','Various items per CMRP24060234','lot',0,'2024-01-01'],
  ['AC DEANG ELECTRICAL SUPPLY','','','','','','Electrical materials','','','Various items per CMRP24060234-EPO002','lot',0,'2024-01-01'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP24060234','lot',0,'2024-01-01'],
  ['ACCENT MICRO TECHNOLOGIES, INC.','Alma Dela Cruz','Alma.Delacruz@amti.com.ph','(02) 718-7388','8th Floor PSE Center East Tower Exchange Road Ortigas Center Pasig City','60 days PDC','IT/AV equipment','','','Various items per CMRP24060234-EPO006','lot',0,'2024-01-01'],
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','Networking/Cabling','','','Various items per CMRP24060234-EPO007','lot',0,'2024-01-01'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','Electrical materials','','','Various items per CMRP24060234-EPO008','lot',0,'2024-01-01'],
  ['AWS Distribution Phils., Corp','Kaye Seviila','kaye@awsgentec.com','+639212630729','357 Dr. Jose Fernandez st. Mandaluyong City','60 days PDC','Networking/Cabling','','','Various items per CMRP24060234-EPO009','lot',0,'2024-01-01'],
  ['HIGHPOINT SYSTEMS INC.','','','','','','Electrical materials','','','Various items per CMRP24060234','lot',0,'2024-01-01'],
  ['PRISMA ELECTRICAL CONTROLS CORP.','Apple Keith Akalaw','projects@prismaelectrical.com','733-4526','747 San Bernardo St. Sta. Cruz Manila','Fund transfer','Electrical materials','','','Various items per CMRP24060234-EPO011','lot',0,'2024-01-01'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','Electrical materials','','','Various items per CMRP24060234-EPO012','lot',0,'2024-01-01'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','Siemens/PLC materials','','','Various items per CMRP24060234-EPO013','lot',0,'2024-01-01'],
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','Electrical materials','','','Various items per CMRP24060234-EPO014','lot',0,'2024-01-01'],
  ['ELECTRUM CONTROLS CORP.','','','','','','Electrical materials','','','Various items per CMRP24060234-EPO015','lot',0,'2024-01-01'],
  ['DIFSYS INC.','','','','','','Electrical materials','','','Various items per CMRP24060234-EPO016','lot',0,'2024-01-01'],
  // CMRP24060224 - IAWORX, WIN, AMTEK, HANWIN, AMTI, ELESCOM, IMAXX, MTECH
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','SCADA/PLC materials','','','Various items per CMRP24060224','lot',0,'2024-01-01'],
  ['WIN ELECTRONICS','','','','','','Electrical materials','','','Various items per CMRP24060224-EPO002','lot',0,'2024-01-01'],
  ['AMTEK INDUSTRIAL CORP.','','','','','','Electrical materials','','','Various items per CMRP24060224','lot',0,'2024-01-01'],
  ['HANWIN ELECTRONICS','','','','','','Electrical materials','','','Various items per CMRP24060224-EPO004','lot',0,'2024-01-01'],
  ['ACCENT MICRO TECHNOLOGIES, INC.','Alma Dela Cruz','Alma.Delacruz@amti.com.ph','(02) 718-7388','8th Floor PSE Center East Tower Exchange Road Ortigas Center Pasig City','60 days PDC','IT/AV equipment','','','Various items per CMRP24060224-EPO005','lot',0,'2024-01-01'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Electrical materials','','','Various items per CMRP24060224-EPO009','lot',0,'2024-01-01'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','Electrical materials','','','Various items per CMRP24060224-EPO010','lot',0,'2024-01-01'],
  ['MTECH Industrial Automation Corporation','Nitzie Recio','nitzie@mtech-siemens.com','0956-5043189','Unit 312 Empire Center Mall Edsa Corner Taft Avenue Pasay City Philippines','100 days PDC','Siemens/PLC materials','','','Various items per CMRP24060224-EPO008','lot',0,'2024-01-01'],
  // CMRP24050176 - MTECH, EXPONENT, IMAXX, RSCOMPONENTS, IAWORX, GOLDENRATIO, AWS, DCPI, ECA, PRISMA, ACTI, JJLAPP, SHOPEE, EXPLORER, HIGHPOINT, DATABLITZ
  ['GOLDEN RATIO ELECTRO-AUTOMATION SYSTEM INC.','Sareena Margrete P. Frias','','+63 919 999 0753','Unit 012 3rd Floor AVR Space Rental Lot 17 Blk 33 Sampaguita St. Cor Jasmine St. T.S Cruz Subd. Almanza Dos Las Pinas City','60 days PDC','Panel materials','','','Various items per CMRP24050176','lot',0,'2024-01-01'],
  ['RS COMPONENTS PHILIPPINES','','','','','','Electrical components','','','Various items per CMRP24050176','lot',0,'2024-01-01'],
  ['ECA ELECTRICAL SUPPLY','','','','','','Electrical materials','','','Various items per CMRP24050176','lot',0,'2024-01-01'],
  // ECA ELECTRICAL SUPPLY - manual line items October 09, 2024
  ['ECA ELECTRICAL SUPPLY','','','','','','Cable Duct 60 x 100','','','Cable Duct 60 x 100','length',939.79,'October 09, 2024'],
  ['ECA ELECTRICAL SUPPLY','','','','','','Cable Duct 80 x 100','','','Cable Duct 80 x 100','length',1124.27,'October 09, 2024'],
  ['ECA ELECTRICAL SUPPLY','','','','','','Din Rail Slotted 35mm x 2mtrs','','','Din Rail Slotted 35mm x 2mtrs','length',472.88,'October 09, 2024'],
  ['ECA ELECTRICAL SUPPLY','','','','','','Termseries Relay 24VDC, 1CO, Weidmuller','556360000','Weidmuller','Termseries Relay 24VDC, 1CO, Weidmuller','pcs',776.68,'October 09, 2024'],
  ['ECA ELECTRICAL SUPPLY','','','','','','TERMSERIES TCC 6.4/10 OR, Cross-connector, Weidmuller','','Weidmuller','TERMSERIES TCC 6.4/10 OR, Cross-connector, Weidmuller MOQ: (10pcs/pack)','pack',2232.00,'October 09, 2024'],
  ['ADVANCE CONTROLE TECHNOLOGIE INC.','Chris Jimenez','christopher_h_jimenez@yahoo.com','0917-811-4620','Blk 13 Lot 8 Mindanao Ave. Gavino Maderan GMA Cavite','50% DP 50% balance upon delivery','Panel assembly','','','Various items per CMRP24050176-EPO013','lot',0,'2024-01-01'],
  ['EXPLORER FREIGHT CORP.','Joselito F. de Leon','jhoeydl@explorerfreight.com','09985391940','GS Cuerda Bldg. Molino Blvd. Niog III Bacoor City Cavite','30 days','Freight/Delivery','','','Various items per CMRP24050176-EPO027','lot',0,'2024-01-01'],
  ['DATABLITZ','','','','','','IT equipment','','','Various items per CMRP24050176-EPO030','lot',0,'2024-01-01'],
  // CMRP23100347 - ELESCOM, IMAXX, AWS, DCPI, SHOTOKU, PRISMA, EXPONENT
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','Electrical materials','','','Various items per CMRP23100347','lot',0,'2024-01-01'],
  ['EXPONENT CONTROLS & ELECTRICAL CORP.','Vanessa Espeso','vanessa.espeso@exponentcontrols.com.ph','09066018154','181 C Sunset Drive St. Brookside Hills Brgy. San Isidro Cainta Rizal','100 days PDC','Siemens/Controls','','','Various items per CMRP23100347-EPO009','lot',0,'2024-01-01'],
  // CMRP24080301 - KAIROS, EXPONENT, ECA, AWS, FEPCOR, ELESCOM, SHOTOKU, PRISMA, ENCLOSURE, LAPP, AK, IMAXX
  ['EXPONENT CONTROLS & ELECTRICAL CORP.','Vanessa Espeso','vanessa.espeso@exponentcontrols.com.ph','09066018154','181 C Sunset Drive St. Brookside Hills Brgy. San Isidro Cainta Rizal','100 days PDC','Siemens/Controls','','','Various items per CMRP24080301-EPO002','lot',0,'2024-01-01'],
  ['ECA ELECTRICAL SUPPLY','','','','','','Electrical materials','','','Various items per CMRP24080301-EPO003','lot',0,'2024-01-01'],
  ['ENCLOSURE SYSTEMS PHILIPPINES','','','','','','Enclosure/Panel','','','Various items per CMRP24080301-EPO009','lot',0,'2024-01-01'],
  ['LAPP (PHILIPPINES)','','','','','','Cable/Wire','','','Various items per CMRP24080301-EPO011','lot',0,'2024-01-01'],
  ['AK ELECTRICAL','','','','','','Electrical materials','','','Various items per CMRP24080301-EPO013','lot',0,'2024-01-01'],
  // CMRP25060301 - TAYAN
  ['TAYAN ELECTRICAL & INDUSTRIAL COMPONENTS ENTERPRISES','Jonathan Ang','yokoyamaelectric@gmail.com','8725-5313','#26 E. Jacinto St., Little Baguio, San Juan City','Fund transfer','Yokoyama PT 200VA 1Phase Transformer','','Yokoyama','240/380/400/480V Output 12/24V Open Type','pcs',1781.25,'2025-08-29'],
  // CMRP25060301 - AMTI
  ['ACCENT MICRO TECHNOLOGIES, INC.','Alma Dela Cruz','Alma.Delacruz@amti.com.ph','(02) 718-7388','8th Floor PSE Center East Tower Exchange Road Ortigas Center Pasig City','60 days PDC','Acer AOpen 27SA3 G0 Monitor','MM.A5YSP.001','Acer','27 inch Monitor 3 years warranty','unit',5267.86,'2025-10-01'],
  ['ACCENT MICRO TECHNOLOGIES, INC.','Alma Dela Cruz','Alma.Delacruz@amti.com.ph','(02) 718-7388','8th Floor PSE Center East Tower Exchange Road Ortigas Center Pasig City','60 days PDC','Acer Altos P10 F9 Tower','DT.L0NSP.06X','Acer','Intel Core i5 13400 16GB 512GB SSD 1TB HDD Windows 11 Pro','unit',42767.86,'2025-10-01'],
  // CMRP25060301 - KAIROS
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Strut Clamp 1/2 inch','','','Strut Clamp 1/2 inch','pcs',13.71,'2025-10-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','1-Hole Clamp 1/2 inch','','','1-Hole Clamp 1/2 inch','pcs',3.39,'2025-10-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','2-Hole Clamp 1/2 inch','','','2-Hole Clamp 1/2 inch','pcs',3.75,'2025-10-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','U-Bolt 1/4 x 1/2 inch','','','U-Bolt 1/4 x 1/2 inch','pcs',4.42,'2025-10-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 1/2 x 3 mtrs','','','IMC Pipe w/ coupling 1/2 x 3 mtrs','lengths',208.37,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Locknut 1/2 inch','','','IMC Locknut 1/2 inch','pcs',2.19,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','C-Clamp 1/2 inch 1 hole','','','C-Clamp 1/2 inch 1 hole','pcs',3.39,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Octagonal Junction Box 1.5mm combi','','','Octagonal Junction Box 1.5mm combi 1/2-3/4 k.o.','pcs',30.40,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Octagonal Junction Box 1/2 k.o','','','Octagonal Junction Box 1/2 k.o','pcs',7.46,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 3/4 x 3 mtrs','','','IMC Pipe w/ coupling 3/4 x 3 mtrs','lengths',277.58,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Locknut 3/4 inch','','','IMC Locknut 3/4 inch','pcs',2.90,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','C-Clamp 3/4 inch 1 hole','','','C-Clamp 3/4 inch 1 hole','pcs',3.75,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 1-1/2','','','IMC Pipe w/ coupling 1-1/2','lengths',618.61,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Locknut 1-1/2 inch','','','IMC Locknut 1-1/2 inch','pcs',9.78,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Rigid Conduit Body LB 1-1/2 inch','','','Rigid Conduit Body LB 1-1/2 inch','pcs',269.33,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Strut Clamp 1-1/2 inch','','','Strut Clamp 1-1/2 inch','pcs',25.67,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Rigid Conduit Body LB 1-1/2 inch','','','Rigid Conduit Body LB 1-1/2 inch','pc',269.33,'2025-10-28'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 1/2 x 3 mtrs','','','IMC Pipe w/ coupling 1/2 x 3 mtrs','lengths',208.37,'2025-11-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Conduit w/Coupling 1/2 x 3 mtrs','','','IMC Conduit w/Coupling 1/2 x 3 mtrs','lengths',208.37,'2026-02-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Locknut 1/2 inch','','','IMC Locknut 1/2 inch','pcs',2.19,'2026-02-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Bushing 1/2 inch','','','IMC Bushing 1/2 inch','pcs',4.02,'2026-02-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','1-Hole Clamp 1/2 inch','','','1-Hole Clamp 1/2 inch','pcs',3.39,'2026-02-06'],
  // CMRP25060301 - ATLANTA
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Pipe 1/2x3m','','Permaline','Permaline Pipe 1/2x3m','pcs',79.07,'2025-10-03'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Male Adap 1/2','','Permaline','Permaline Male Adapter 1/2','pcs',5.86,'2025-10-03'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Pipe 1/2x3m','','Permaline','Permaline Pipe 1/2x3m','pcs',79.07,'2025-10-14'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Male Adap 1/2','','Permaline','Permaline Male Adapter 1/2','pcs',5.86,'2025-10-14'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Junction Box w/ cover','','Permaline','Permaline Junction Box w/ cover','pcs',40.27,'2025-10-14'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Pipe 11/4x3m','','Permaline','Permaline Pipe 11/4x3m','pcs',199.14,'2025-10-14'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Elbow 11/4x90','','Permaline','Permaline Elbow 11/4x90','pcs',45.39,'2025-10-14'],
  ['Atlanta Industries Inc.','Cecilia Yap','avillareal@atlanta.ph','0917 3221300','35th Floor Atlanta Center 31 Anapolis St Greenhills San Juan','Fund transfer','Permaline Male Adap 11/4','','Permaline','Permaline Male Adapter 11/4','pcs',16.84,'2025-10-14'],
  // CMRP25060301 - NET PACIFIC
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','SIEMON CAT6A 4-PAIR F/UTP CABLE LS0H VIOLET','9A6L4-A5','Siemon','CAT6A 4-PAIR F/UTP CABLE','mtrs',6.01,'2025-10-08'],
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','BELDEN RS-485 1 PAIR 24AWG','9841','Belden','BELDEN RS-485 1 PAIR 24AWG OVERALL BELDFOIL','mtrs',27.08,'2025-10-08'],
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','ENDURA 2-SHIELDED TWISTED PAIR 22AWG 4-CORE','STP224B','Endura','ENDURA 2-SHIELDED TWISTED PAIR 22AWG STRANDED 4-CORE GRAY','mtrs',8.53,'2025-09-05'],
  ['NET PACIFIC INC.','Hannah Pamel G. Luna','purchasing6@netpacific.net','09159767942','174B Bantayan Road Extension Brgy. Palingon Tipas Taguig City','30 days PDC','CCA-500-BA','P55802-Y157-A452','Siemens','CCA-500-BA Add 500 building automation data points license for DESIGO CC','unit',85593.66,'2025-10-23'],
  // CMRP25060301 - SHOBAI
  ['Shobai Enterprises','Kyzel Salamat','Shobai_1971@yahoo.com','0949-333-3200','111 Palico St. Imus City Cavite','10% DP 20days PDC','QBE61.3-DP2 Differential pressure sensor','QBE61.3-DP2','Siemens','Differential pressure sensor for liquids and gases 0...2 bar, 0-10V output, IP54, G 1/2 thread, HVAC/building automation','pc',22321.43,'2025-11-21'],
  // CMRP25060301 - ELESCOM
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','MY-2N Power Relay 5A 12VDC 8pin with socket','','','Power Relay 5A 12VDC 8pin with socket','sets',285.71,'2025-11-25'],
  // CMRP25060301 - FC EMPIRE
  ['FC Empire Enterprise','Fraz Nino Pasquil','FLPasquil@yahoo.com','+639399294846','535-C Kamuning St. Juna Subd. Matina Davao City / Manila Branch 801 Ferros Bel-Air Tower','10% DP 30 Days PDC','DESIGO PXC4.E16','PXC4.E16','Siemens','DESIGO PXC4.E16 PLC I/O module for HVAC; 16 I/O (12 universal, 4 relay); 24V ac/dc; BACnet/IP; expandable to 40 I/O via TXM modules','pcs',30000.00,'2026-02-09'],
  // CMRP25070317 - SUMITOMO
  ['Sumitomo (SHI) Cyclo Drive Asia Pacific Pte. Ltd','Ms. Heather Oliva','heathermarland.oliva@shi-g.com','+639178381361','C4 C5 Bldg. Granville Industrial Complex Governors Drive Carmona Cavite','30 days','Sumitomo Invertek VFD Optidrive Eco 11kW 15Hp','%VV3E23411K0M','Sumitomo','ODV-3-340240-3F12-MN 24A 11kW IP20 380-480V','units',41311.00,'2025-08-05'],
  ['Sumitomo (SHI) Cyclo Drive Asia Pacific Pte. Ltd','Ms. Heather Oliva','heathermarland.oliva@shi-g.com','+639178381361','C4 C5 Bldg. Granville Industrial Complex Governors Drive Carmona Cavite','30 days','Sumitomo Invertek VFD Optidrive Eco 15kW 20Hp','%VV3E23415K0M','Sumitomo','ODV-3-440300-3F12-MN 30A 15kW IP20 380-480V','units',69775.00,'2025-08-05'],
  // CMRP25070317 - DCPI
  ['DCPI Distribution & Control Products, Inc.','Harold V. Cortez','','+63 917-6348576','74 P. Cruz Street San Jose Mandaluyong City','60 days PDC','ABB A1N125TMF050-3P 50AT 125AF 3P','1SDA066726R1','ABB','50AT 125AF 3P 50KAIC@240V','pcs',2627.71,'2025-08-05'],
  ['DCPI Distribution & Control Products, Inc.','Harold V. Cortez','','+63 917-6348576','74 P. Cruz Street San Jose Mandaluyong City','60 days PDC','ABB A1N125TMF060-3P 60AT 125AF 3P','1SDA066727R1','ABB','60AT 125AF 3P 50KAIC@240V','pcs',2825.46,'2025-08-05'],
  ['DCPI Distribution & Control Products, Inc.','Harold V. Cortez','','+63 917-6348576','74 P. Cruz Street San Jose Mandaluyong City','60 days PDC','ABB SH202-C10 10A 2P','2CDS212001R0104','ABB','10A In 2P 10kA 240V/6kA@440V','pc',382.11,'2025-08-05'],
  ['DCPI Distribution & Control Products, Inc.','Harold V. Cortez','','+63 917-6348576','74 P. Cruz Street San Jose Mandaluyong City','60 days PDC','ABB SH202-C6 6A 2P','2CDS212001R0064','ABB','6A In 2P 10kA 240V/6kA@440V','pc',382.11,'2025-08-05'],
  // CMRP25070317 - TAYAN
  ['TAYAN ELECTRICAL & INDUSTRIAL COMPONENTS ENTERPRISES','Jonathan Ang','yokoyamaelectric@gmail.com','8725-5313','#26 E. Jacinto St. Little Baguio San Juan City','Advance Payment','440VAC/230VAC Transformer 150VA','','Yokoyama','440VAC/230VAC Transformer 150VA','unit',1500.00,'2025-08-11'],
  // CMRP25070317 - IMAXX
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','JWT6011F Thermostat BLUE','JWT6011F','Leipole','THERMOSTAT BLUE Normally open','pc',440.60,'2025-08-11'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9926.230 12X12 FAN FILTER RAL 7035','FK9926.230','Leipole','12X12 FAN FILTER RAL 7035','pcs',6736.96,'2025-08-11'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9926.300 12X12 OUTLET FILTER RAL 7035','FK9926.300','Leipole','12X12 OUTLET FILTER RAL 7035','pcs',1512.37,'2025-08-11'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','Phoenix CD 80X100 Cable duct','3240264','Phoenix','Cable duct 80X100','pcs',1685.47,'2025-09-17'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9925.230 10x10 FAN FILTER RAL 7035','FK9925.230','Leipole','10x10 FAN FILTER RAL 7035','pcs',4750.24,'2025-10-29'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9925.300 10X10 OUTLET FILTER RAL 7035','FK9925.300','Leipole','10X10 OUTLET FILTER RAL 7035','pcs',859.62,'2025-10-29'],
  // CMRP25070317 - AGA
  ['AGA SYSTEM INC.','Lito Auro','','(632) 847-2366','Lot 6 Blk. 4 B1 Naga Road Pulang Lupa Dos Las Pinas City','30 days PDC','Control Panel IP54 Ga.16','','','G.I sheet Ga.16 powder coated wrinkled beige RAL7032 IP54 1450x1000x500mm','assy',29107.14,'2025-08-11'],
  // CMRP25070317 - FEPCOR
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB SH202-C10 10A 2P','2CDS212001R0104','ABB','10A In 2P 10kA 240V/6kA@440V','pc',382.14,'2025-09-16'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB SH202-C6 6A 2P','2CDS212001R0064','ABB','6A In 2P 10kA 240V/6kA@440V','pc',382.14,'2025-09-16'],
  // CMRP25070317 - ACTI
  ['ADVANCE CONTROLE TECHNOLOGIE INC.','Chris Jimenez','christopher_h_jimenez@yahoo.com','0917-811-4620','Blk 13 Lot 8 Mindanao Ave. Gavino Maderan GMA Cavite','50% DP 50% balance upon delivery','Wiring and Assembly of VFD Panel','','','VFD Panel wiring assembly components supplied by CMRP','lot',60000.00,'2025-09-17'],
  // CMRP25100500 - JJLAPP
  ['JJLAPP (P) INC.','Racquel Quines','','+63 939 503 2928','5/F Orion Building 11th Ave Corner 38th St BGC Taguig City','30 days PDC','OLFLEX CLASSIC 110 7G0.75','53593','Helukabel','OLFLEX CLASSIC 110 7G0.75 P/N 1119107','mtrs',111.00,'2025-11-24'],
  // CMRP25070326 - SHOTOKU
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','THHN Columbia 3.5mm2 RED','','Columbia','THHN 3.5mm2 RED','box',4241.07,'2025-11-13'],
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','THHN Columbia 3.5mm2 BLK','','Columbia','THHN 3.5mm2 BLK','box',4241.07,'2025-11-13'],
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','THHN Columbia 3.5mm2 BLU','','Columbia','THHN 3.5mm2 BLU','box',4241.07,'2025-11-13'],
  ['Shotoku Trading Corporation','Mira Gaspar','shotoku.trading@gmail.com','+639667443786','512 Boni Avenue Plainview Mandaluyong City','30 days PDC','THHN Columbia 3.5mm2 GRN','','Columbia','THHN 3.5mm2 GRN','box',4241.07,'2025-11-13'],
  // CMRP25080415 - KAIROS
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 3/4 x 3 mtrs','','','IMC Pipe w/ coupling 3/4 x 3 mtrs','lengths',277.58,'2025-11-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','IMC Pipe w/ coupling 1/2 x 3 mtrs','','','IMC Pipe w/ coupling 1/2 x 3 mtrs','lengths',208.37,'2025-11-06'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Strut Channel Slotted','','','Strut Channel Slotted','length',410.71,'2025-11-06'],
  // CMRP25080415 - TAKEZO
  ['FIRST TAKEZO CORPORATION','Cell Arceno','cellfirst.takezocorp@gmail.com','+639175054663','Narcisa St. Cor. Mayhaligue St. Abad Santos Manila','30 days PDC','Ridgid IMC pipe bender 1/2-3/4','','Ridgid','Ridgid IMC pipe bender 1/2-3/4','pcs',6142.86,'2025-11-21'],
  // CMRP25100500 - SHOBAI
  ['Shobai Enterprises','Kyzel Salamat','Shobai_1971@yahoo.com','0949-333-3200','111 Palico St. Imus City Cavite','10% DP 20days PDC','TXM1.8U 8 Universal I/O Module','TXM1.8U','Siemens','TXM1.8U 8 Universal I/O Module for Desigo Px; configurable DI/AI/AO; 0-10V; DIN rail; expandable to PXC4 automation stations','unit',16900.00,'2025-12-02'],
  // CMRP25100500 - PRISMA
  ['PRISMA ELECTRICAL CONTROLS CORP.','Apple Keith Akalaw','projects@prismaelectrical.com','733-4526','747 San Bernardo St. Sta. Cruz Manila','Fund transfer','MCGILL CONDUIT L.T. PVC COATED FLEXIBLE ULTRA TUFF 3/4','I-MCG-CON-00108','McGill','MCGILL CONDUIT L.T. PVC COATED FLEXIBLE ULTRA TUFF 3/4 GREY','mtrs',87.03,'2025-12-09'],
  // CMRP25060265B - AWS
  ['AWS Distribution Phils., Corp','Kaye Seviila','kaye@awsgentec.com','+639212630729','357 Dr. Jose Fernandez st. Mandaluyong City','60 days PDC','ALANTEK CAT6 4 PR GREY 24AWG UTP CABLE SOLID','','Alantek','ALANTEK CAT6 4 PR GREY 24AWG UTP CABLE SOLID','roll',7008.93,'2026-02-06'],
  // CMRP25060265B - ELESCOM
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Current Transformer 1000A','','','Current Transformer 1000A','pcs',1140.18,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','THHN Wire 2.0 Black','','','THHN Wire 2.0 Black','box',3794.64,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','TF Wire 0.75 Black','','','TF Wire 0.75 Black','roll',2232.14,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrules 2.0 mmsq','','','Ferrules 2.0 mmsq','pack',120.54,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrules 0.75 mmsq','','','Ferrules 0.75 mmsq','pack',80.36,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Terminal Blocks JUTI-2.5','','','Terminal Blocks JUTI-2.5','pcs',24.29,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Tie Wire 4 inch','','','Tie Wire 4 inch','pack',62.50,'2026-02-06'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Spiral KS-8','','','Spiral KS-8','pack',169.64,'2026-02-06'],
  // CMRP25030149 - IAWORX
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','SIMATIC S7 Memory Card 256 MB','6ES7954-8LL03-0AA0','Siemens','SIMATIC S7 Memory Card 256 MB Flash for S7-1200/1500 CPU','pc',17134.00,'2025-09-18'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','ET 200SP IM 155-6 PN ST interface module','6ES7155-6AA02-0BN0','Siemens','ET 200SP IM 155-6 PN ST interface module PROFINET','pcs',17706.00,'2025-09-18'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','ET 200SP DI 16x24VDC ST','6ES7131-6BH01-0BA0','Siemens','ET 200SP DI 16x24VDC ST digital input module 16 channels','pcs',5075.00,'2025-09-18'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','ET 200SP DQ 16x24VDC/0.5A ST','6ES7132-6BH01-0BA0','Siemens','ET 200SP DQ 16x24VDC/0.5A ST digital output module 16 channels','pcs',5921.00,'2025-09-18'],
  ['IAWORX SOLUTIONS & SERVICES INC.','Arvin M. De Jesus','arvindejesus.iaworx@gmail.com','8845-1248','Unit 206 Relta Bldg. Laguna Bel Air Drive Sta. Rosa City Laguna','90 days PDC','ET 200SP BaseUnit BU15-P16+A0+2D','6ES7193-6BP00-0DA0','Siemens','ET 200SP BaseUnit BU15-P16+A0+2D push-in terminals','pcs',1579.00,'2025-09-18'],
  // CMRP25030149 - EXPONENT
  ['EXPONENT CONTROLS & ELECTRICAL CORP.','Vanessa Espeso','vanessa.espeso@exponentcontrols.com.ph','09066018154','181 C Sunset Drive St. Brookside Hills Brgy. San Isidro Cainta Rizal','100 days PDC','CPU 1515-2 PN','6ES7515-2AN03-0AB0','Siemens','SIMATIC S7-1500 CPU 1515-2 PN 1 MB program 4.5 MB data PROFINET IRT','pc',145466.10,'2025-09-18'],
  ['EXPONENT CONTROLS & ELECTRICAL CORP.','Vanessa Espeso','vanessa.espeso@exponentcontrols.com.ph','09066018154','181 C Sunset Drive St. Brookside Hills Brgy. San Isidro Cainta Rizal','100 days PDC','ET 200SP AI 4xU/I 2-wire ST','6ES7134-6HD01-0BA1','Siemens','ET 200SP AI 4xU/I 2-wire ST analog input module 4 channels 16-bit','pc',10023.39,'2025-09-18'],
  ['EXPONENT CONTROLS & ELECTRICAL CORP.','Vanessa Espeso','vanessa.espeso@exponentcontrols.com.ph','09066018154','181 C Sunset Drive St. Brookside Hills Brgy. San Isidro Cainta Rizal','100 days PDC','SITOP PSU100S','6EP1334-2BA20','Siemens','SITOP PSU100S 24V DC 10A 240W 120/230V AC input','pcs',16268.31,'2025-09-18'],
  // CMRP25030149 - GOLDEN
  ['GOLDEN RATIO ELECTRO-AUTOMATION SYSTEM INC.','Sareena Margrete P. Frias','','+63 919 999 0753','Unit 012 3rd Floor AVR Space Rental Lot 17 Blk 33 Sampaguita St. Cor Jasmine St. T.S Cruz Subd. Almanza Dos Las Pinas City','60 days PDC','Tekpan Teos plus+ 2000x800x800','','Tekpan','Tekpan Teos plus+ 2000x800x800','units',63841.60,'2025-10-16'],
  ['GOLDEN RATIO ELECTRO-AUTOMATION SYSTEM INC.','Sareena Margrete P. Frias','','+63 919 999 0753','Unit 012 3rd Floor AVR Space Rental Lot 17 Blk 33 Sampaguita St. Cor Jasmine St. T.S Cruz Subd. Almanza Dos Las Pinas City','60 days PDC','Delivery charge','','','Tekpan Panel Delivery charge','lot',892.86,'2025-11-04'],
  // CMRP25030149 - FEPCOR
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB AX40-30-10-80 Contactor','1SBL321074R8010','ABB','AX40-30-10-80 220-230V50Hz/230-240V60Hz Contactor','pcs',2425.89,'2025-10-23'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB HK1-11 Auxiliary contact','1SAM201902R1001','ABB','HK1-11 Aux.-contact 1 NO + 1 NC','pcs',371.43,'2025-10-23'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB CA5X-22M Auxiliary contact block','1SBN019040R1122','ABB','CA5X-22M Auxiliary contact block','pcs',873.21,'2025-10-23'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB AX09-30-10-80 Contactor','1SBL901074R8010','ABB','AX09-30-10-80 220-230V50Hz/230-240V60Hz Contactor','pcs',670.54,'2026-02-04'],
  ['FEPCOR ELECTRICAL CORP','Luisito Tulin','luisito.fepcor@gmail.com','','9633 Kamagong St. San Antonio Village Makati City','30 days PDC','ABB MS132-6.3 Manual Motor Starter','1SAM350000R1009','ABB','MS132-6.3 Manual Motor Starter 4.0-6.3 A','pc',1595.54,'2026-02-04'],
  // CMRP25030149 - UES
  ['UNITED ELECTRICAL SPECIALIST, INC.','Ulyses S. Buhia','ulyses.buhia@uesph.com','09177182304','Door No. 1 Rosario-Segundo Apartment Lourdes Village Punta Princesa Cebu City','30 days','ABB MS165-42 Manual Motor Starter','1SAM451000R1015','ABB','MS165-42 Manual Motor Starter 30-42 A','pc',2037.50,'2025-10-23'],
  ['UNITED ELECTRICAL SPECIALIST, INC.','Ulyses S. Buhia','ulyses.buhia@uesph.com','09177182304','Door No. 1 Rosario-Segundo Apartment Lourdes Village Punta Princesa Cebu City','30 days','ABB MS116-1.6 Manual Motor Starter','1SAM250000R1006','ABB','MS116-1.6 Manual Motor Starter 1.0-1.6 A','pcs',1687.50,'2025-10-23'],
  ['UNITED ELECTRICAL SPECIALIST, INC.','Ulyses S. Buhia','ulyses.buhia@uesph.com','09177182304','Door No. 1 Rosario-Segundo Apartment Lourdes Village Punta Princesa Cebu City','30 days','ABB MS116-6.3 Manual Motor Starter','1SAM250000R1009','ABB','MS116-6.3 Manual Motor Starter 4.0-6.3 A','pcs',1687.50,'2025-10-23'],
  // CMRP25030149 - PROFIBUS
  ['PROFIBUS INDUSTRIAL CONTROL SYSTEM, INC.','Antonio Mortel Jr','ehvoy_mortel@yahoo.com.ph','0917-829-8943','Partoza Compound South Drive St. Barangay San Antonio San Pedro Laguna','30 days','ABB MS165-42 Manual Motor Starter','1SAM451000R1015','ABB','MS165-42 Manual Motor Starter 30-42 A','pc',12875.00,'2025-10-27'],
  ['PROFIBUS INDUSTRIAL CONTROL SYSTEM, INC.','Antonio Mortel Jr','ehvoy_mortel@yahoo.com.ph','0917-829-8943','Partoza Compound South Drive St. Barangay San Antonio San Pedro Laguna','30 days','ABB MS116-1.6 Manual Motor Starter','1SAM250000R1006','ABB','MS116-1.6 Manual Motor Starter 1.0-1.6 A','pcs',1723.21,'2025-10-27'],
  ['PROFIBUS INDUSTRIAL CONTROL SYSTEM, INC.','Antonio Mortel Jr','ehvoy_mortel@yahoo.com.ph','0917-829-8943','Partoza Compound South Drive St. Barangay San Antonio San Pedro Laguna','30 days','ABB MS116-6.3 Manual Motor Starter','1SAM250000R1009','ABB','MS116-6.3 Manual Motor Starter 4.0-6.3 A','pcs',1723.21,'2025-10-27'],
  // CMRP25030149 - FC EMPIRE
  ['FC Empire Enterprise','Fraz Nino Pasquil','FLPasquil@yahoo.com','+639399294846','535-C Kamuning St. Juna Subd. Matina Davao City / Manila Branch 801 Ferros Bel-Air Tower','10% DP 30 Days PDC','SITOP UPS500S 360W','6EP1933-2EC51','Siemens','SITOP UPS500S 22-29V DC input DIN rail uninterruptible power supply 360W','pcs',34375.00,'2025-12-09'],
  // CMRP25030149 - EXPLORER
  ['EXPLORER FREIGHT CORP.','Joselito F. de Leon','jhoeydl@explorerfreight.com','09985391940','GS Cuerda Bldg. Molino Blvd. Niog III Bacoor City Cavite','30 days','Domestic Shipment Boom Truck','','','Pick-up ACTI GMA to URC Dasmarinas Cavite 3 panels 811x2108 100-150kg','lot',24500.00,'2026-01-22'],
  // CMRP25030149 - RAS
  ['RAS POWER SYSTEM CORPORATION','Jojo Abordo','raspowersystem@gmail.com','09778420577','2C APECC Bldg. Meaddowood Ave. P.F Espiritu V. Bacoor Cavite','30 days','Cable Tray Wireaway 180x100x2400mm','','','Cable Tray Wireaway Type with Cover Straight-Run 1.5mmT G.I. Powder Coated Orange','assy',3839.29,'2026-02-02'],
  // CMRP25030149 - KAIROS
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Hexa bolt 3/8','','','Hexa bolt 3/8','pcs',2.14,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Hexagonal nut 3/8 inch','','','Hexagonal nut 3/8 inch','pcs',0.71,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Anchor grip 3/8 inch','','','Anchor grip 3/8 inch','pcs',4.60,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Conduit hanger 1/2 inch','','','Conduit hanger 1/2 inch','pcs',8.39,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Conduit hanger 1 inch','','','Conduit hanger 1 inch','pcs',16.07,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Square box with cover 4x4 inch','','','Square box with cover 4x4 inch','sets',44.60,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Junction box with cover 4x4 inch','','','Junction box with cover 4x4 inch','sets',37.86,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Unistrut Clamp 3/4 inch','','','Unistrut Clamp 3/4 inch','pcs',14.78,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Locknut 3/4 inch','','','Locknut 3/4 inch','pcs',2.90,'2026-02-03'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Bushing 3/4 inch','','','Bushing 3/4 inch','pcs',5.98,'2026-02-03'],
  // Kairos - manual line items
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','EMT Pipe 1/2"','','','EMT Pipe 1/2"','length',126.43,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','U-Bolt 1/4" x 1/2"','','','U-Bolt 1/4" x 1/2"','pcs',4.42,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Rigid Conduit Body - LB 1/2"','','','Rigid Conduit Body - LB 1/2"','pcs',67.99,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Octagonal Junction Box 1.5mm, 1/2" k.o.','','','Octagonal Junction Box 1.5mm, 1/2" k.o.','pcs',30.40,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Octagonal Junction Cover','','','Octagonal Junction Cover','pcs',7.46,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Strut Channel - Solid/Slotted','','','Strut Channel - Solid/Slotted','length',410.71,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','Strut Clamp 1/2"','','','Strut Clamp 1/2"','pcs',13.71,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','EMT Set Screw Connector 1/2"','','','EMT Set Screw Connector 1/2"','pcs',7.10,'2025-01-01'],
  ['Kairos Electrical and Industrial Supply','Halvin Henschel C See','kairosmktng@yahoo.com','+639178269326','1675 Alfonso Mendoza St. Sta. Cruz Manila','90 days','EMT Set Screw Coupling 1/2"','','','EMT Set Screw Coupling 1/2"','pcs',7.77,'2025-01-01'],
  // CMRP25030149 - AWS
  ['AWS Distribution Phils., Corp','Kaye Seviila','kaye@awsgentec.com','+639212630729','357 Dr. Jose Fernandez st. Mandaluyong City','60 days PDC','Wago 2004-1201 terminal block','2004-1201','Wago','2-conductor through terminal block 4 mm² Push-in CAGE CLAMP gray DIN-rail 35x15','pcs',33.93,'2026-02-04'],
  // CMRP25030149 - IMAXX
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9925.230 10x10 FAN FILTER 230V RAL 7035','FK9925.230','Leipole','10x10 FAN FILTER 230V RAL 7035','pcs',5924.15,'2026-02-04'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','FK9925.300 10x10 FILTER 230V RAL 7035','FK9925.300','Leipole','10x10 FILTER 230V RAL 7035','pcs',1033.92,'2026-02-04'],
  ['IMAXX ENERGIE SOLUTIONS CORP','Christine Pasamanero','sales.imaxx@gmail.com','0917 713 5400','#79 Sct. Reyes cor. Sct. Lozano Paligsahan Quezon City','30 days','JWT6011 Thermostat','JWT6011','Leipole','THERMOSTAT','pcs',1750.34,'2026-02-04'],
  // CMRP25030149 - TAKEZO
  ['FIRST TAKEZO CORPORATION','Angela Sales','angelatakezo@gmail.com','+639068003090','Narcisa St. Cor. Mayhaligue St. Abad Santos Manila','30 days','Lithium Battery 20V 2.0ah','','Ingco','Lithium Battery 20V 2.0ah','pcs',1107.14,'2026-02-05'],
  ['FIRST TAKEZO CORPORATION','Angela Sales','angelatakezo@gmail.com','+639068003090','Narcisa St. Cor. Mayhaligue St. Abad Santos Manila','30 days','Compact Brushless cordless impact drill 20V','CIDLI20668','Ingco','Compact Brushless cordless impact drill 20V CIDLI20668','pcs',5223.21,'2026-02-05'],
  // CMRP25030149 - ELESCOM
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','THHN 3.5mm2 Yellow','','','THHN 3.5mm2 Yellow','box',6695.54,'2026-02-11'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrule 0.75','','','Ferrule 0.75','pcs',0.80,'2026-02-11'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrule 1.5','','','Ferrule 1.5','pcs',0.89,'2026-02-11'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrule 2.0','','','Ferrule 2.0','pcs',1.21,'2026-02-11'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Ferrule 3.5','','','Ferrule 3.5','pcs',2.05,'2026-02-11'],
  ['ELECTRICAL & EQUIPMENT SALES CO.','Mr. Gilbert','elescom@yahoo.com','913-2692','Katipunan Ave. Blueridge Quezon City','30 days','Vecas Breaker 2P 20A','','','Vecas Breaker 2P 20A','pcs',279.46,'2026-02-11'],
];

function normalizeSupplierName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\bcorporation\b/g, 'corp')
    .replace(/\bincorporated\b/g, 'inc')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const { main: extractFromPdfs } = require('./extract-pdf-items.js');
  const extractedRows = await extractFromPdfs();

  const manualRows = ROWS.filter((r) => {
    const desc = (r[9] || '').toString();
    return !desc.startsWith('Various items') && !desc.includes('Various items per');
  });

  const combined = [...manualRows, ...extractedRows];
  const dbPath = path.join(__dirname, '..', 'projects.db');
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        payment_terms TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS supplier_products (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL,
        name TEXT,
        part_no TEXT,
        description TEXT,
        brand TEXT,
        unit TEXT DEFAULT 'pcs',
        unit_price REAL,
        price_date TEXT,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      )
    `);
    await run('DELETE FROM supplier_products');
    await run('DELETE FROM suppliers');

    const byNorm = new Map();
    for (const r of combined) {
      const supName = (r[0] || '').toString().trim();
      if (!supName) continue;
      const norm = normalizeSupplierName(supName);
      if (!byNorm.has(norm)) {
        byNorm.set(norm, {
          id: `supplier-${Date.now()}-${norm.replace(/\W/g, '-')}-${Math.random().toString(36).slice(2)}`,
          name: supName,
          contact: (r[1] || '').toString().trim(),
          email: (r[2] || '').toString().trim(),
          phone: (r[3] || '').toString().trim(),
          address: (r[4] || '').toString().trim(),
          paymentTerms: (r[5] || '').toString().trim() || null,
          products: [],
        });
      }
      const entry = byNorm.get(norm);
      entry.products.push({
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: (r[6] || '').toString().trim() || (r[9] || '').toString().trim().slice(0, 200),
        partNo: (r[7] || '').toString().trim(),
        description: (r[9] || '').toString().trim().slice(0, 500),
        brand: (r[8] || '').toString().trim() || null,
        unit: (r[10] || 'pcs').toString().trim(),
        unitPrice: typeof r[11] === 'number' && r[11] >= 0 ? r[11] : parseFloat(String(r[11] || '0').replace(/,/g, '')) || null,
        priceDate: (r[12] || '').toString().trim() || null,
      });
    }

    const sortedSuppliers = Array.from(byNorm.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    const now = new Date().toISOString();
    for (const sup of sortedSuppliers) {
      await run(
        'INSERT INTO suppliers (id, name, contact_name, email, phone, address, payment_terms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sup.id, sup.name, sup.contact || null, sup.email || null, sup.phone || null, sup.address || null, sup.paymentTerms, now]
      );
      for (const p of sup.products) {
        await run(
          'INSERT INTO supplier_products (id, supplier_id, name, part_no, description, brand, unit, unit_price, price_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, sup.id, p.name || null, p.partNo || null, p.description || null, p.brand, p.unit || 'pcs', p.unitPrice, p.priceDate]
        );
      }
    }

    const totalProducts = combined.length;
    console.log(`\nLoaded ${byNorm.size} suppliers, ${totalProducts} product rows into database (${dbPath})`);

    const logDir = path.join(__dirname, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const supplierProductsLogPath = path.join(logDir, 'suppliers-and-products.txt');
    const logLines = [
      `Suppliers and products — ${new Date().toISOString()}`,
      `Total: ${byNorm.size} suppliers, ${totalProducts} product rows`,
      '',
    ];
    for (const sup of sortedSuppliers) {
      logLines.push(`=== Supplier: ${sup.name} ===`);
      if (sup.contact) logLines.push(`  Contact: ${sup.contact}`);
      if (sup.email) logLines.push(`  Email: ${sup.email}`);
      if (sup.phone) logLines.push(`  Phone: ${sup.phone}`);
      if (sup.address) logLines.push(`  Address: ${sup.address}`);
      if (sup.paymentTerms) logLines.push(`  Payment terms: ${sup.paymentTerms}`);
      logLines.push('  Products:');
      sup.products.forEach((p, i) => {
        const desc = (p.name || p.description || '—').toString().slice(0, 80);
        const part = p.partNo ? ` | ${p.partNo}` : '';
        const price = p.unitPrice != null ? ` | ${p.unit} | PHP ${p.unitPrice}` : '';
        const date = p.priceDate ? ` | ${p.priceDate}` : '';
        logLines.push(`    ${i + 1}. ${desc}${part}${price}${date}`);
      });
      logLines.push('');
    }
    fs.writeFileSync(supplierProductsLogPath, logLines.join('\n'), 'utf8');
    console.log(`Log: ${supplierProductsLogPath}`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
