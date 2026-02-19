/**
 * OSH Program PDF aligned to DO 198-18 (DOLE) and Advance Controle Technologie Inc.
 * Based on the structure of the standard OSH Program Form.
 */
import type jsPDF from 'jspdf';

const MARGIN = 18;
const LINE_HEIGHT = 5.5;
const HEADING_COLOR = [26, 63, 114] as [number, number, number];

export const ACTI_OSH_PROFILE = {
  companyName: 'Advance Controle Technologie Inc',
  dateEstablished: '',
  address: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117',
  phoneFax: '',
  websiteEmail: '',
  ownerManager: '',
  totalEmployees: '',
  maleEmployees: '',
  femaleEmployees: '',
  businessDescription: 'Manufacturing / Service',
  productDescription: '',
  serviceDescription: '',
  safetyOfficerName: 'Arnel Bautista Jr.',
  safetyOfficerTitle: 'Safety Officer II',
  shcChairperson: '',
  shcSecretary: 'Arnel Bautista Jr.',
  shcMembers: '',
  firstAider: '',
  ohNurse: '',
  pollutionControlOfficer: '',
  annualOshCost: '',
};

function addPage(doc: jsPDF) {
  doc.addPage([210, 297], 'p');
}

function writeHeading(doc: jsPDF, text: string, y: number): number {
  doc.setTextColor(HEADING_COLOR[0], HEADING_COLOR[1], HEADING_COLOR[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(text, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + LINE_HEIGHT;
}

function writeBody(doc: jsPDF, text: string, y: number, maxWidth: number): number {
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line: string) => {
    if (y > 280) {
      addPage(doc);
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  });
  return y + 2;
}

function writeLabelValue(doc: jsPDF, label: string, value: string, y: number, maxWidth: number): number {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(label, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  const v = value || '_________________________________________________';
  doc.text(v, MARGIN + doc.getTextWidth(label) + 2, y);
  return y + LINE_HEIGHT;
}

/** Build multi-page OSH Program PDF for Advance Controle Technologie Inc. (DO 198-18 aligned) */
export async function buildOshProgramPdf(doc: jsPDF, profile: typeof ACTI_OSH_PROFILE): Promise<void> {
  const w = 210;
  const bodyWidth = w - MARGIN * 2;
  let y = MARGIN;

  // ----- Page 1: Title & Company Profile -----
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(HEADING_COLOR[0], HEADING_COLOR[1], HEADING_COLOR[2]);
  doc.text('Occupational Safety and Health (OSH) Program', w / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(12);
  doc.text(profile.companyName, w / 2, y, { align: 'center' });
  y += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  y = writeHeading(doc, 'I. Company Profile / Project Details', y);
  y = writeLabelValue(doc, 'Company Name: ', profile.companyName, y, bodyWidth);
  y = writeLabelValue(doc, 'Date Established: ', profile.dateEstablished, y, bodyWidth);
  y += 2;
  doc.text('Complete Address:', MARGIN, y);
  y += LINE_HEIGHT;
  const addrLines = doc.splitTextToSize(profile.address, bodyWidth);
  addrLines.forEach((line: string) => {
    doc.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  });
  y = writeLabelValue(doc, 'Phone/Fax: ', profile.phoneFax, y, bodyWidth);
  y = writeLabelValue(doc, 'Website/Email: ', profile.websiteEmail, y, bodyWidth);
  y = writeLabelValue(doc, 'Owner/Manager/President: ', profile.ownerManager, y, bodyWidth);
  y = writeLabelValue(doc, 'Total Employees: ', profile.totalEmployees || '_____ Male _____ Female _____', y, bodyWidth);
  y = writeLabelValue(doc, 'Business: ', profile.businessDescription, y, bodyWidth);
  y = writeLabelValue(doc, 'Product descriptions: ', profile.productDescription, y, bodyWidth);
  y = writeLabelValue(doc, 'Description of services: ', profile.serviceDescription, y, bodyWidth);

  // ----- Page 2: Basic Components -----
  addPage(doc);
  y = MARGIN;
  y = writeHeading(doc, 'Basic Components of Company OSH Program and Policy (DO 198-18, Ch. IV, Sec. 12)', y);
  const components = [
    '1.0 Company Commitment to Comply with OSH Requirements',
    '2.0 General Safety and Health Programs (HIRAC, Medical Surveillance, First-aid)',
    '3.0 Promotion of Drug-Free Workplace, Mental Health, Healthy Lifestyle',
    '4.0 Prevention and Control of HIV-AIDS, Tuberculosis, Hepatitis B',
    '5.0 Composition and Duties of Safety and Health Committee',
    '6.0 OSH Personnel and Facilities',
    '7.0 Safety and Health Promotion, Training and Education',
    '8.0 Toolbox/Safety Meetings, Job Safety Analysis',
    '9.0 Accident/Incident/Illness Investigation, Recording and Reporting',
    '10.0 Personal Protective Equipment (PPE)',
    '11.0 Safety Signages',
    '12.0 Dust Control and Management; Regulation on Temporary Structures, Lifting, Electrical/Mechanical',
    '13.0 Welfare Facilities',
    '14.0 Emergency and Disaster Preparedness and Response',
    '15.0 Solid Waste Management System',
    '16.0 Compliance with Reportorial Government Requirements',
    '17.0 Control and Management of Hazards (HIRAC)',
    '18.0 Prohibited Acts and Penalties for Violations',
    '19.0 Cost of Implementing Company OSH Program',
  ];
  components.forEach((line) => {
    doc.setFontSize(9);
    doc.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  });

  // ----- Page 3: Company Commitment -----
  addPage(doc);
  y = MARGIN;
  y = writeHeading(doc, '1.0 Company Commitment to Comply with OSH Policy', y);
  const commitment = `${profile.companyName} do hereby commit to comply with the requirements of RA 11058 and DOLE Department Order 198-18 (Implementing Rules and Regulations) and the applicable provisions of the Occupational Safety and Health Standards (OSHS). We acknowledge the company's obligation and responsibilities to provide appropriate funds for implementing this OSH program including orientation and training of employees on OSH, provision and dissemination of IEC materials, provision of Personal Protective Equipment (PPE) when necessary and other OSH related requirements, to ensure the protection for our workers and employees against injuries, illnesses and death through safe and healthy working conditions and environment. We commit to conduct risk assessment as required and to comply with other provisions of this OSH program. We are fully aware of the penalties and sanctions for OSH violations as provided for in RA 11058 and its IRR.`;
  y = writeBody(doc, commitment, y, bodyWidth);
  y += 4;
  doc.text('[Signature] _________________________  [Name] _________________________  [President/CEO/Owner]  [Date] ________', MARGIN, y);

  // ----- Page 4: General Safety Programs, SHC, OSH Personnel -----
  addPage(doc);
  y = MARGIN;
  y = writeHeading(doc, '2.0 General Safety and Health Programs', y);
  y = writeBody(doc, '2.1 Risk Assessment (HIRAC): The company shall conduct hazard identification, risk assessment and control. A Risk Assessment Matrix shall be maintained and reviewed by the Safety and Health Committee.', y, bodyWidth);
  y = writeBody(doc, '2.2 Medical Surveillance: All employees shall undergo baseline/initial medical examination prior to assignment to potentially hazardous activity. Annual medical examination and random drug testing as per company policy.', y, bodyWidth);
  y = writeBody(doc, '2.3 First-Aid and Emergency Medical Services: Treatment room/first-aid room and adequate medical supplies; affiliation with hospital(s) as applicable.', y, bodyWidth);
  y += 2;
  y = writeHeading(doc, '5.0 Composition and Duties of Safety and Health Committee', y);
  doc.text('Chairperson (Owner/Manager): ' + (profile.shcChairperson || '_________________________'), MARGIN, y);
  y += LINE_HEIGHT;
  doc.text('Secretary (Safety Officer): ' + (profile.shcSecretary || profile.safetyOfficerName || '_________________________'), MARGIN, y);
  y += LINE_HEIGHT;
  doc.text('Members: ' + (profile.shcMembers || 'Worker representative(s), First-aider, OH personnel as applicable'), MARGIN, y);
  y += 4;
  y = writeHeading(doc, '6.0 OSH Personnel and Facilities', y);
  doc.text('Safety Officer(s): ' + (profile.safetyOfficerName || '_________________________') + ' — ' + (profile.safetyOfficerTitle || ''), MARGIN, y);
  y += LINE_HEIGHT;
  doc.text('First-aider / OH Nurse / Emergency health personnel and facilities as per OSHS.', MARGIN, y);

  // ----- Page 5: Training, Reporting, PPE, Annex A -----
  addPage(doc);
  y = MARGIN;
  y = writeHeading(doc, '7.0–11.0 Safety Promotion, Training, Toolbox Meetings, Accident Reporting, PPE, Signages', y);
  y = writeBody(doc, 'The company shall provide OSH orientation to all workers, conduct risk assessment and continuing training for OSH personnel, maintain toolbox/safety meetings and job safety analysis. All accidents/incidents/near misses shall be investigated, recorded and reported to DOLE as required (WAIR, AEDR, AMR). PPE shall be issued with training on use and maintenance. Safety signages shall be posted as required.', y, bodyWidth);
  y += 2;
  y = writeHeading(doc, '12.0–19.0 Additional Requirements', y);
  y = writeBody(doc, 'Dust control and management; regulation on temporary structures and electrical/mechanical operations; welfare facilities (drinking water, sanitary facilities, lactation station, etc.); written emergency and disaster program and drills; solid waste management and Pollution Control Officer; reportorial compliance; hazard control (HIRAC); prohibited acts and penalties; annual cost of OSH program as applicable.', y, bodyWidth);

  // ----- Page 6: Annex A - Workplace Policy -----
  addPage(doc);
  y = MARGIN;
  y = writeHeading(doc, 'ANNEX A: Workplace Policy on Promoting Workers Health and Prevention/Control of Health-Related Issues', y);
  const annexA = `${profile.companyName} is committed to promote and ensure a healthy and safe working environment through its various health programs for its employees. We shall conform to all issuances and laws that guarantee workers health and safety at all times. The company shall ensure that workers' health is maintained through: (a) Orientation and education of employees; (b) Access to reliable information on illness and hazards at work; (c) Referral to medical experts for diagnosis and management; (d) Health-related programs such as proper nutrition and exercise. These programs shall comply with Government issuances on healthy lifestyle, mental health in the workplace and prevention and control of substance abuse (RA 9165, RA 11166, EO 187-03, RA 11036, etc.). The company shall promote workers' rights: confidentiality, non-discrimination, work accommodation, and assistance to compensation. This policy is formulated for everybody's information. The company is committed to ensuring workers' health and providing a healthy and safe workplace.`;
  y = writeBody(doc, annexA, y, bodyWidth);
  y += 6;
  doc.text('_________________________     _________________________', MARGIN, y);
  doc.text('Owner/Manager                  Employees\' Representative', MARGIN, y + LINE_HEIGHT);
  doc.text('DATE: ________', MARGIN, y + LINE_HEIGHT * 2);
}
