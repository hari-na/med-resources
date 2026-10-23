// Scored viva question banks, one array per case id, inlined into the hub at build time by
// build.py. Kept out of app/case-files.html because the banks are the bulk of the words in
// this project and the hub is the bulk of its logic, and because a question is edited far
// more often than the drill around it.
//
// Each question:
//   id    unique across every bank, because a student's answers are stored against it and
//         a reused id would merge two questions' histories. Prefix per case.
//   lv    1 Foundation, 2 Clinical, 3 Examiner's edge. Level 1 and 2 are what an Indian
//         final-year examiner actually asks at the bedside; level 3 is the hardest of those,
//         not registrar material.
//   type  the topic the progress screen groups by: Anatomy, Examination, History,
//         Classification, Investigation, Management, Treatment, Complications, Pathology.
//   q     the question, as an examiner would put it. Never "what does the book say".
//   a     the answer. It answers the question in its first clause, and only then adds any
//         note about where the three books disagree.
//   ref   the page citation, in the same form the guides use: "Das 38 p.594 · B&L 64 p.1060".
//         Every one is checked by check_bank.py against the chapter and page it names.

var VIVA_BANKS = {

  "inguinal-hernia": [
      {id:"h01", lv:1, type:"Anatomy", q:"Define a hernia.",
       a:"S Das: a hernia is defined as protrusion of whole or a part of a viscus through the wall that contains it. Bailey & Love: a hernia is an abnormal protrusion of an organ or tissue through an opening in the layer that normally confines it. Either is accepted; S Das is the one an Indian examiner is most likely to be marking against.", ref:"Das 38 p.594 · B&L 64 p.1058"},
      {id:"h02", lv:1, type:"Anatomy", q:"Name the three parts of a hernia, and the four parts of its sac.",
       a:"Covering, sac and contents. The sac has a mouth, neck, body and fundus.", ref:"SRB 18 p.741"},
      {id:"h03", lv:1, type:"Anatomy", q:"By what route does an indirect inguinal hernia leave the abdomen?",
       a:"Through the deep inguinal ring, lateral to the inferior epigastric vessels, obliquely along the inguinal canal, emerging at the superficial ring. Lateral by origin, oblique by course.", ref:"Das 38 p.594 · B&L 64 p.1066"},
      {id:"h04", lv:1, type:"Anatomy", q:"Give the boundaries of Hesselbach's triangle.",
       a:"Lateral border of rectus abdominis medially, inferior epigastric vessels laterally, inguinal ligament below. B&L names the pubic bone and iliopubic tract as the lower border. The neck of a direct sac lies medial to the inferior epigastric vessels.", ref:"Das 38 p.603 · B&L 64 p.1066"},
      {id:"h05", lv:1, type:"Examination", q:"What are the two classical signs of an uncomplicated hernia, and the two caveats?",
       a:"Impulse on coughing and reducibility. Caveats: a swelling with a cough impulse is not necessarily a hernia, and a swelling with no cough impulse may still be one.", ref:"Das 38 p.598 · B&L 64 p.1061"},
      {id:"h06", lv:1, type:"Classification", q:"When is an inguinal hernia 'complete'?",
       a:"Only when the contents reach the bottom of the scrotum. Short of that, incomplete; still inside the superficial ring, a bubonocele.", ref:"Das 38 p.594, p.603"},
      {id:"h07", lv:1, type:"History", q:"Which inguinal hernia is typical of the young, and which of the old?",
       a:"Indirect in the young, and always the congenital type in neonates and young children. Direct mostly in older subjects, more common above 40.", ref:"Das 38 p.594, p.604 · B&L 64 p.1066"},
      {id:"h08", lv:1, type:"Classification", q:"Name the possible contents of a hernial sac.",
       a:"Omentum (omentocele/epiplocele), intestine (enterocele), bladder (cystocele), Meckel's diverticulum (Littre's), part of the bowel circumference (Richter's), appendix (Amyand's), ovary with fallopian tube, and fluid.", ref:"SRB 18 p.741–742"},
      {id:"h09", lv:1, type:"Examination", q:"Why must the patient be examined standing?",
       a:"A direct hernia disappears the moment he lies down. S Das examines standing first; B&L lies the patient down first to reduce and assess. Do both: standing to demonstrate, supine to assess the defect.", ref:"Das 38 p.596 · B&L 64 p.1061"},
      {id:"h10", lv:1, type:"Examination", q:"How far must you expose the patient?",
       a:"Both inguinal regions, from the umbilicus to mid-thigh. Inadequate exposure of this area is exactly why femoral hernias are missed.", ref:"Das 38 p.595 · B&L 64 p.1071"},
      {id:"h11", lv:1, type:"Classification", q:"Name the clinical types of hernia.",
       a:"Reducible, irreducible, obstructed, inflamed, strangulated, and SRB adds occult. B&L's complexity scale ends in infarcted.", ref:"Das 38 p.604–605 · SRB 18 p.742–743 · B&L 64 p.1060"},
      {id:"h12", lv:1, type:"Anatomy", q:"Where is the superficial inguinal ring, and what should it admit?",
       a:"A triangular opening in the external oblique aponeurosis, 1.25 cm above the pubic tubercle, bounded by a superomedial and an inferolateral crus. Normally it does not admit the tip of the little finger, or only just.", ref:"SRB 18 p.743"},
      {id:"h13", lv:1, type:"Examination", q:"Where does an inguinal hernia lie relative to the pubic tubercle? And a femoral hernia?",
       a:"Inguinal: above the inguinal ligament and medial to the pubic tubercle. Femoral: below the ligament and lateral to the tubercle. Edition note, not a live disagreement: B&L 26e said 'above and lateral' for the inguinal hernia and 28e has deleted that sentence, so the books now agree. The only relation 28e prints is the femoral one, and it matches S Das.", ref:"Das 38 p.597 · B&L 64 p.1071"},
      {id:"h14", lv:1, type:"History", q:"What proportion of adult hernia repairs are inguinal?",
       a:"Inguinal hernia is by far the commonest, and the figure usually quoted is that it accounts for about 80% of all hernia repairs. Then the detail: B&L 28e no longer prints that 80% figure. What it says is that inguinal hernia is the most common hernia in men and around 10 times more common in men than in women, that more than 80% of inguinal hernias are indirect, and that almost all hernias in children and women are indirect.", ref:"B&L 64 p.1065 · Das 38 p.603"},

      {id:"h20", lv:2, type:"History", q:"Describe the pain of an early hernia. What does it mean when it stops?",
       a:"Dragging and aching, worse as the day passes, often appearing before the lump. It ceases once the hernia is fully formed: so settling pain means the hernia has finished forming, not that he is improving. B&L: sharp intermittent pain suggests pinching; severe pain means high risk of strangulation.", ref:"Das 38 p.594 · B&L 64 p.1061"},
      {id:"h21", lv:2, type:"History", q:"Give the four set questions for any inguinoscrotal swelling.",
       a:"How did it start: on straining? Where did it first appear: groin descending, or below the crease ascending? What size when first seen, bottom of scrotum at once, or gradual? Does it disappear on lying down?", ref:"Das 38 p.594–595"},
      {id:"h22", lv:2, type:"History", q:"Is a hernia caused by heavy lifting?",
       a:"Classically yes. But B&L 28e begins from the premise that a normal abdominal wall has sufficient strength to resist high pressure, so the strain brings the hernia to the patient's attention rather than causing it. The evidence favours an inherited imbalance of collagen types, supported by the association with aortic aneurysm, by the difficulty of repair in Ehlers-Danlos syndrome, and by smoking raising risk through impaired collagen maturation. SRB agrees in its own words, 'metastatic emphysema of Read'. Edition note: the Olympic weightlifters line was 26e's way of making this argument and has been removed from 28e, so quote the mechanism, not the weightlifters.", ref:"B&L 64 p.1060 · SRB 18 p.741"},
      {id:"h23", lv:2, type:"Examination", q:"A hernia with no cough impulse. What does that mean?",
       a:"A complication, strangulated or incarcerated: or a neck blocked by adhesions. It is also typical of femoral hernia, where its absence leads to misdiagnosis as a lymph node. A saphena varix and a varicocele give false positives.", ref:"Das 38 p.597, p.599 · B&L 64 p.1061, p.1071"},
      {id:"h24", lv:2, type:"Examination", q:"Describe Zieman's technique and its precondition.",
       a:"Index on the deep ring (indirect), middle on the superficial ring (direct), ring finger on the saphenous opening 4 cm below and lateral to the pubic tubercle (femoral); the patient holds his nose and blows, or coughs. Only valid with no obvious swelling, or after complete reduction.", ref:"Das 38 p.599"},
      {id:"h25", lv:2, type:"Examination", q:"In the invagination test, what does the direction of the finger tell you?",
       a:"Directly backwards, direct. Upwards, backwards and outwards: indirect. Impulse on the pulp means direct; on the tip, oblique.", ref:"Das 38 p.600–601"},
      {id:"h26", lv:2, type:"Examination", q:"Explain the ring occlusion test and its logic.",
       a:"Standing, hernia reduced, thumb over the deep ring, cough. An indirect hernia comes through that ring so it is blocked; a direct one comes medial to it and bulges medial to your finger. B&L warns even experienced surgeons cannot distinguish the two with certainty.", ref:"Das 38 p.601 · B&L 64 p.1067"},
      {id:"h27", lv:2, type:"Examination", q:"Distinguish an enterocele from an omentocele at the bedside.",
       a:"Enterocele: elastic, resonant, reduces with a gurgle, first part difficult and last part easy, may show peristalsis. Omentocele: doughy and granular, dull, no gurgle, first part easy and last part resists.", ref:"Das 38 p.598, p.600 · SRB 18 p.742"},
      {id:"h28", lv:2, type:"Examination", q:"Why is rectal examination obligatory in a case of hernia?",
       a:"To exclude chronic constipation and an enlarged prostate, causes of straining that recur the hernia. And prostatic symptoms predict postoperative urinary retention.", ref:"Das 38 p.603 · B&L 64 p.1070"},
      {id:"h29", lv:2, type:"Complications", q:"Differentiate an irreducible from a strangulated hernia.",
       a:"Both are irreducible. The strangulated one is extremely tense and tender, may have red overlying skin, and has lost its cough impulse. All absent in pure irreducibility.", ref:"Das 38 p.604–605"},
      {id:"h30", lv:2, type:"Complications", q:"Define obstructed hernia, and say why the diagnosis is dangerous.",
       a:"Irreducibility plus intestinal obstruction with blood supply intact. It shares two of the three features of strangulation, so calling a strangulated hernia 'obstructed' wastes the time that would have saved the patient.", ref:"Das 38 p.604–605"},
      {id:"h31", lv:2, type:"Examination", q:"Why examine abdominal muscle tone, and how?",
       a:"To choose the operation, herniorrhaphy if tone is good, hernioplasty if poor. Observe in profile; the rising test, where weak obliques give Malgaigne's bulgings; and a finger in the superficial ring during a cough.", ref:"Das 38 p.602"},
      {id:"h32", lv:2, type:"History", q:"A hernia that enlarges before micturition and shrinks after. What is in it?",
       a:"Urinary bladder: a cystocele, only in a direct or sliding hernia. Pressing it provokes a desire to micturate. The medially placed bladder is pulled into a direct hernia.", ref:"Das 38 p.604 · B&L 64 p.1066"},
      {id:"h33", lv:2, type:"Management", q:"Which investigation establishes the diagnosis?",
       a:"None, it is clinical. Investigations are for fitness and cause. In doubt: ultrasound first, low cost but highly operator dependent; CT for complex or incisional hernia, and for planning abdominal wall reconstruction; MRI for sportsman's groin; laparoscopy for an occult contralateral hernia, though it will not show an intraparietal hernia. Plain x-ray is of little value. Herniography is SRB's answer, not B&L 28e's. And a negative scan does not exclude the hernia you felt, because groin hernias tend to reduce in a supine patient.", ref:"B&L 64 p.1061, p.1062"},
      {id:"h34", lv:2, type:"Management", q:"State the four principles of any hernia repair.",
       a:"Reduce the contents and remove non-viable tissue; excise and close the peritoneal sac, though small sacs may be reduced intact; close the defect if possible; reinforce with mesh, since closure alone has a high recurrence rate and mesh reduces but does not prevent recurrence. B&L 28e adds a fifth: excise redundant skin if necessary for cosmesis.", ref:"B&L 64 p.1062"},
      {id:"h35", lv:2, type:"History", q:"A right direct hernia in a man with a right iliac fossa scar. Connect them.",
       a:"Appendicectomy through a McBurney incision injured the ilioinguinal nerve, weakening the inguinal region and producing a right-sided direct hernia.", ref:"SRB 18 p.741 · Das 38 p.595"},

      {id:"h40", lv:3, type:"Anatomy", q:"Where exactly is the deep inguinal ring?",
       a:"S Das and SRB: 1.25 cm above the mid-inguinal point, midway between the ASIS and the symphysis pubis. B&L: midway between the ASIS and the pubic tubercle, the midpoint of the inguinal ligament: 2–3 cm above the femoral pulse. The mid-inguinal point overlies the femoral artery; the midpoint of the ligament overlies the deep ring.", ref:"Das 38 p.599 · SRB 18 p.743 · B&L 64 p.1065"},
      {id:"h41", lv:3, type:"Complications", q:"Which hernia strangulates most often?",
       a:"Two answers to two questions. The most common strangulated hernia is the indirect inguinal, because inguinal hernias are far more numerous. The highest rate of strangulation is in the femoral hernia. Fifty per cent of femoral hernias present as an emergency, against five per cent of inguinal.", ref:"SRB 18 p.743 · B&L 64 p.1070, p.1071"},
      {id:"h42", lv:3, type:"Complications", q:"Why can a small hernia be more dangerous than a large one?",
       a:"Risk depends on the neck, not the bulk. A small rigid-walled defect traps contents, acts as a constriction ring, impedes venous return and progresses to strangulation. A wide-necked direct hernia rarely strangulates.", ref:"B&L 64 p.1060, p.1062"},
      {id:"h43", lv:3, type:"Complications", q:"What is Garrey's stricture?",
       a:"An ischaemic narrowing of small bowel that has been reduced from an obstructed hernia, a stricture forming later at the site of the constriction ring.", ref:"SRB 18 p.742–743"},
      {id:"h44", lv:3, type:"Classification", q:"What is Amyand's hernia? And Littre's?",
       a:"Amyand's, the appendix in an inguinal hernial sac, often incarcerated. Littre's: a Meckel's diverticulum in the sac; Littre described it 81 years before Meckel was born.", ref:"SRB 18 p.742–743"},
      {id:"h45", lv:3, type:"Complications", q:"What is Richter's hernia, and why is it treacherous?",
       a:"Strangulation of only part of the circumference of the bowel, often complicating a femoral hernia. It mimics gastroenteritis: colic, bowels opening normally, sometimes diarrhoea, so operation is delayed. It may be impossible to detect clinically, yet the bowel can necrose and perforate.", ref:"Das 38 p.605–606 · B&L 64 p.1060"},
      {id:"h46", lv:3, type:"Classification", q:"Classify a hernia by the European Hernia Society system.",
       a:"Primary or recurrent (P/R); lateral, medial or femoral (L/M/F); defect size in finger breadths at 1.5 cm each. A primary indirect hernia with a 3 cm defect is PL2.", ref:"B&L 64 p.1067"},
      {id:"h47", lv:3, type:"Classification", q:"What is a sliding hernia, and what is the surgical danger?",
       a:"Extraperitoneal viscus, caecum on the right, sigmoid on the left, bladder either side, slides outside the sac and forms part of its wall. B&L: the sac forms secondarily, which distinguishes it from a classic indirect hernia; the large bowel wall may not be covered by peritoneum and can be damaged at operation.", ref:"Das 38 p.605 · B&L 64 p.1066"},
      {id:"h48", lv:3, type:"Management", q:"Choose the operation, and justify it.",
       a:"Herniotomy in a child: the wall is normal and in infants the rings are superimposed with no obliquity. Herniorrhaphy in a young adult with good tone. Hernioplasty with mesh where tone is poor, Malgaigne's bulgings are present, or the hernia is large or recurrent. Lichtenstein is commonest worldwide; laparoscopic TEP or TAPP for bilateral or recurrent hernia.", ref:"SRB 18 p.743 · Das 38 p.602 · B&L 64 p.1068-1069"},
      {id:"h49", lv:3, type:"Management", q:"Describe the Shouldice repair and how it differs from Bassini.",
       a:"Bassini sutures conjoint tendon to inguinal ligament from pubic tubercle to deep ring. Shouldice first incises the transversalis fascia from deep ring to pubic tubercle and closes it as a double-thick, two-layered posterior wall, double breasting: then the external oblique likewise. The only one of 150+ modifications with benefit; under 2% lifetime failure in expert hands, identical to Bassini in general hands.", ref:"B&L 64 p.1068"},
      {id:"h50", lv:3, type:"Management", q:"What size mesh, and what must it cover?",
       a:"Lichtenstein: 8 × 15 cm over the posterior wall, split around the cord at the deep ring. Laparoscopic: 10 × 15 cm crossing the midline into the retropubic space and 5 cm lateral to the deep ring, covering Hesselbach's triangle, the deep ring and the femoral canal together. At least 2 cm overlap, up to 5 cm.", ref:"B&L 64 p.1068, p.1069"},
      {id:"h51", lv:3, type:"Management", q:"Why are lightweight large-pore meshes preferred?",
       a:"Better integration, less contracture, less foreign body reaction, more flexibility and better comfort. Heavyweight mesh provokes a greater fibrous reaction, with collagen contraction and stiffening, impaired abdominal wall mobility, foreign body sensation and pain. Note the vocabulary: the mesh does not shrink, the fibrous tissue grown into it contracts, so 'mesh contracture' is the accurate term, and it can exceed 50% of area. Edition note: 28e has dropped the weight thresholds in g/m² and argues from pore size instead, favouring at least 1 mm in all directions.", ref:"B&L 64 p.1063, p.1064"},
      {id:"h52", lv:3, type:"Management", q:"Groin pain four months after a Lichtenstein repair. What is it?",
       a:"Chronic pain: defined as pain at three months, the commonest complication of open flat mesh repair, reported up to 20%. Most severe form is neuralgic, from injury to or irritation of the ilioinguinal, iliohypogastric or genital branch of the genitofemoral nerve, or from mesh shrinkage.", ref:"B&L 64 p.1069, p.1070"},
      {id:"h53", lv:3, type:"Management", q:"Laparoscopic or open, what does the evidence say?",
       a:"Laparoscopic repair gives less pain both immediately and up to five years later, faster return to full activity, and fewer wound complications: infection, bleeding and seroma. Particular benefit in bilateral hernias and in recurrence after open repair. Note what is not claimed: recurrence is no different between open and laparoscopic, nor between mesh types. The limit is a long learning curve. Robot assistance has shown little additional patient benefit so far and is hard to justify on cost for a simple repair. Edition note: 28e no longer cites the 'over 60 randomised trials' figure.", ref:"B&L 64 p.1069, p.1070"},
      {id:"h54", lv:3, type:"Management", q:"Would you repair the asymptomatic other side?",
       a:"Occult contralateral hernias are present in up to 20% of patients, so the other groin must always be examined, and a patient with a single hernia has a 50% lifetime risk of developing one on the other side. Some surgeons have suggested offering bilateral repair, especially if laparoscopic surgery is planned, but that is not widespread practice. Edition note: the lifetime risk was 33% in 26e and is 50% in 28e.", ref:"B&L 64 p.1061, p.1067"},
      {id:"h55", lv:3, type:"Examination", q:"List the differential diagnosis of a groin swelling.",
       a:"Integument: sebaceous cyst, lipoma, neurofibroma. Hernia: inguinal, femoral. Lymphatic: inguinal lymphadenopathy. Vascular: saphena varix, aneurysm. Inguinal canal: ectopic testis, lipoma or hydrocele of the cord, hydrocele of the canal of Nuck. Deep: psoas abscess. The common four are inguinal hernia, femoral hernia, inguinal lymphadenopathy and saphena varix.", ref:"SRB 18 p.741"},
      {id:"h56", lv:3, type:"Complications", q:"A patient has unexplained small bowel obstruction. What must you do?",
       a:"Examine the groins carefully for a femoral hernia. It is missed because the area is inadequately exposed, it may be only 1–2 cm, it loses its cough impulse early, and it is mistaken for a lymph node. CT in obstruction can identify one the clinician missed.", ref:"B&L 64 p.1071"},
      {id:"h57", lv:3, type:"Management", q:"Does every hernia need repair?",
       a:"No. Small hernias can be more dangerous than large, because risk follows the defect and not the lump. Femoral hernia should always be repaired. Recommend repair when complications are likely, for symptomatic or irreducible hernias, when reduction is getting harder or the hernia is enlarging, and in younger adults. Watchful waiting in an asymptomatic inguinal hernia in an elderly patient appears generally safe, with an annual crossover to surgery of around 10% as symptoms develop. Trusses are not recommended.", ref:"B&L 64 p.1062"}
  ]

};
