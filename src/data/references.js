// Reading list. Every card cites one or more of these by id.
export const REFERENCES = {
  openstax: {
    text: 'Betts, J. G., et al. Anatomy and Physiology 2e. OpenStax, 2022 (CC BY 4.0).',
    url: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
  },
  'openstax-bone': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 6: Bone Tissue and the Skeletal System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/6-introduction',
  },
  'openstax-cell': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 3: The Cellular Level of Organization.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/3-introduction',
  },
  bonewald: {
    text: 'Bonewald, L. F. "The amazing osteocyte." Journal of Bone and Mineral Research 26(2):229–238, 2011.',
    url: 'https://doi.org/10.1002/jbmr.320',
  },
  alberts: {
    text: 'Alberts, B., et al. Molecular Biology of the Cell, 6th ed. Garland Science, 2014.',
    url: 'https://wwnorton.com/books/9780815345244',
  },
  watsoncrick: {
    text: 'Watson, J. D., and Crick, F. H. C. "Molecular structure of nucleic acids." Nature 171:737–738, 1953.',
    url: 'https://doi.org/10.1038/171737a0',
  },
  drew1981: {
    text: 'Drew, H. R., et al. "Structure of a B-DNA dodecamer." PNAS 78(4):2179–2183, 1981 (Protein Data Bank (PDB) ID 1BNA).',
    url: 'https://www.rcsb.org/structure/1BNA',
  },
  azevedo: {
    text: 'Azevedo, F. A. C., et al. "Equal numbers of neuronal and nonneuronal cells make the human brain." Journal of Comparative Neurology 513(5):532–541, 2009.',
    url: 'https://doi.org/10.1002/cne.21974',
  },
  ochs: {
    text: 'Ochs, M., et al. "The number of alveoli in the human lung." American Journal of Respiratory and Critical Care Medicine 169(1):120–124, 2004.',
    url: 'https://doi.org/10.1164/rccm.200308-1107OC',
  },
  'openstax-blood': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 18: The Cardiovascular System: Blood.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/18-introduction',
  },
  'openstax-heart': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 19: The Cardiovascular System: The Heart.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-introduction',
  },
  'openstax-muscle': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 10: Muscle Tissue.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/10-introduction',
  },
  'openstax-immune': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 21: The Lymphatic and Immune System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/21-introduction',
  },
  evansfung: {
    text: 'Evans, E., and Fung, Y.-C. "Improved measurements of the erythrocyte geometry." Microvascular Research 4(4):335–347, 1972.',
    url: 'https://doi.org/10.1016/0026-2862(72)90069-6',
  },
  perutz: {
    text: 'Perutz, M. F. "Stereochemistry of cooperative effects in haemoglobin." Nature 228:726–739, 1970.',
    url: 'https://doi.org/10.1038/228726a0',
  },
  huxley1954: {
    text: 'Huxley, H., and Hanson, J. "Changes in the cross-striations of muscle during contraction and stretch and their structural interpretation." Nature 173:973–976, 1954.',
    url: 'https://doi.org/10.1038/173973a0',
  },
  gordon1966: {
    text: 'Gordon, A. M., Huxley, A. F., and Julian, F. J. "The variation in isometric tension with sarcomere length in vertebrate muscle fibres." Journal of Physiology 184:170–192, 1966.',
    url: 'https://doi.org/10.1113/jphysiol.1966.sp007909',
  },
  rayment1993: {
    text: 'Rayment, I., et al. "Structure of the actin-myosin complex and its implications for muscle contraction." Science 261:58–65, 1993.',
    url: 'https://doi.org/10.1126/science.8316858',
  },
  holmes1990: {
    text: 'Holmes, K. C., et al. "Atomic model of the actin filament." Nature 347:44–49, 1990.',
    url: 'https://doi.org/10.1038/347044a0',
  },
  janeway: {
    text: 'Murphy, K., and Weaver, C. Janeway\'s Immunobiology, 9th ed. Garland Science, 2016.',
    url: 'https://wwnorton.com/books/9780815345053',
  },
  victora2022: {
    text: 'Victora, G. D., and Nussenzweig, M. C. "Germinal centers." Annual Review of Immunology 40:413–442, 2022.',
    url: 'https://doi.org/10.1146/annurev-immunol-120419-022408',
  },
  serhan2014: {
    text: 'Serhan, C. N. "Pro-resolving lipid mediators are leads for resolution physiology." Nature 510:92–101, 2014.',
    url: 'https://doi.org/10.1038/nature13479',
  },
  sender2016: {
    text: 'Sender, R., Fuchs, S., and Milo, R. "Revised estimates for the number of human and bacteria cells in the body." PLOS Biology 14(8):e1002533, 2016.',
    url: 'https://doi.org/10.1371/journal.pbio.1002533',
  },
  medzhitov2008: {
    text: 'Medzhitov, R. "Origin and physiological roles of inflammation." Nature 454:428–435, 2008.',
    url: 'https://doi.org/10.1038/nature07201',
  },
  'openstax-nervous': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 12: The Nervous System and Nervous Tissue.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/12-introduction',
  },
  'openstax-brain': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 13: Anatomy of the Nervous System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/13-introduction',
  },
  'openstax-respiratory': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 22: The Respiratory System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-introduction',
  },
  hursh1939: {
    text: 'Hursh, J. B. "Conduction velocity and diameter of nerve fibers." American Journal of Physiology 127(1):131–139, 1939.',
    url: 'https://doi.org/10.1152/ajplegacy.1939.127.1.131',
  },
  hodgkinhuxley1952: {
    text: 'Hodgkin, A. L., and Huxley, A. F. "A quantitative description of membrane current and its application to conduction and excitation in nerve." Journal of Physiology 117:500–544, 1952.',
    url: 'https://doi.org/10.1113/jphysiol.1952.sp004764',
  },
  sudhof2013: {
    text: 'Südhof, T. C. "Neurotransmitter release: the last millisecond in the life of a synaptic vesicle." Neuron 80(3):675–690, 2013.',
    url: 'https://doi.org/10.1016/j.neuron.2013.10.022',
  },
  clements1996: {
    text: 'Clements, J. D. "Transmitter timecourse in the synaptic cleft: its role in central synaptic function." Trends in Neurosciences 19(5):163–171, 1996.',
    url: 'https://doi.org/10.1016/S0166-2236(96)10024-2',
  },
  singernicolson1972: {
    text: 'Singer, S. J., and Nicolson, G. L. "The fluid mosaic model of the structure of cell membranes." Science 175:720–731, 1972.',
    url: 'https://doi.org/10.1126/science.175.4023.720',
  },
  gehr1978: {
    text: 'Gehr, P., Bachofen, M., and Weibel, E. R. "The normal human lung: ultrastructure and morphometric estimation of diffusion capacity." Respiration Physiology 32(2):121–140, 1978.',
    url: 'https://doi.org/10.1016/0034-5687(78)90104-4',
  },
  wagner1977: {
    text: 'Wagner, P. D. "Diffusion and chemical reaction in pulmonary gas exchange." Physiological Reviews 57(2):257–312, 1977.',
    url: 'https://doi.org/10.1152/physrev.1977.57.2.257',
  },
  pubchem: {
    text: 'PubChem compound records: L-glutamic acid (CID 33032), oxygen (CID 977), carbon dioxide (CID 280). National Library of Medicine.',
    url: 'https://pubchem.ncbi.nlm.nih.gov/',
  },
  luger1997: {
    text: 'Luger, K., et al. "Crystal structure of the nucleosome core particle at 2.8 Å resolution." Nature 389:251–260, 1997 (PDB ID 1AOI).',
    url: 'https://doi.org/10.1038/38444',
  },
  nirenberg1961: {
    text: 'Nirenberg, M. W., and Matthaei, J. H. "The dependence of cell-free protein synthesis in E. coli upon naturally occurring or synthetic polyribonucleotides." PNAS 47(10):1588–1602, 1961.',
    url: 'https://doi.org/10.1073/pnas.47.10.1588',
  },
  ingram1957: {
    text: 'Ingram, V. M. "Gene mutations in human haemoglobin: the chemical difference between normal and sickle cell haemoglobin." Nature 180:326–328, 1957.',
    url: 'https://doi.org/10.1038/180326a0',
  },
  'ncbi-hbb': {
    text: 'NCBI Gene: HBB hemoglobin subunit beta (Gene ID 3043), Homo sapiens. National Library of Medicine.',
    url: 'https://www.ncbi.nlm.nih.gov/gene/3043',
  },
  'openstax-bio-genes': {
    text: 'Clark, M. A., et al. Biology 2e, chapter 15: Genes and Proteins. OpenStax, 2018 (CC BY 4.0).',
    url: 'https://openstax.org/books/biology-2e/pages/15-introduction',
  },
  'openstax-bio-macro': {
    text: 'Clark, M. A., et al. Biology 2e, chapter 3: Biological Macromolecules. OpenStax, 2018 (CC BY 4.0).',
    url: 'https://openstax.org/books/biology-2e/pages/3-introduction',
  },
  rdkit: {
    text: 'Molecule geometry generated with RDKit (open-source cheminformatics, BSD license) using ETKDG v3 (Riniker and Landrum, J. Chem. Inf. Model. 55:2562–2574, 2015) and the MMFF94 force field (Halgren, J. Comput. Chem. 17:490–519, 1996).',
    url: 'https://www.rdkit.org/',
  },
  'campbell-biology': {
    text: 'Urry, L. A., et al. Campbell Biology, 12th ed. Pearson, 2020. Table 2.1: elements in the human body (percent of body mass, including water).',
    url: 'https://openlibrary.org/search?q=Campbell+Biology+Urry',
  },
  'wiki-body-composition': {
    text: 'Wikipedia. "Composition of the human body" (mass and atom percentages from several data sets).',
    url: 'https://en.wikipedia.org/wiki/Composition_of_the_human_body',
  },
  'bertini-ca': {
    text: 'Bertini, I., Gray, H. B., Lippard, S. J., and Valentine, J. S. Bioinorganic Chemistry, section 2.1: "About carbonic anhydrase." LibreTexts.',
    url: 'https://chem.libretexts.org/Bookshelves/Inorganic_Chemistry/Book3A_Bioinorganic_Chemistry_(Bertini_et_al.)/02:_The_Reaction_Pathways_of_Zinc_Enzymes_and_Related_Biological_Catalysts/2.01:_About_Carbonic_Anhydrase',
  },
  lindskog1997: {
    text: 'Lindskog, S. "Structure and mechanism of carbonic anhydrase." Pharmacology and Therapeutics 74(1):1–20, 1997.',
    url: 'https://doi.org/10.1016/S0163-7258(96)00198-2',
  },
  silverman1988: {
    text: 'Silverman, D. N., and Lindskog, S. "The catalytic mechanism of carbonic anhydrase: implications of a rate-limiting protolysis of water." Accounts of Chemical Research 21(1):30–36, 1988.',
    url: 'https://doi.org/10.1021/ar00145a005',
  },
  'binks-hh': {
    text: 'Binks, A. Pulmonary Physiology for Pre-Clinical Students, 11.3: "The Henderson–Hasselbalch equation." LibreTexts.',
    url: 'https://med.libretexts.org/Courses/Virginia_Tech_Carilion_School_of_Medicine/Pulmonary_Physiology_for_Pre-Clinical_Students_(Binks)/11:_Alkalosis_and_Acidosis/11.03:_The_Henderson-Hasselbalch_equation',
  },
  'openstax-leukocytes': {
    text: 'OpenStax Anatomy and Physiology, section 18.4: Leukocytes and Platelets (cell sizes and proportions).',
    url: 'https://openstax.org/books/anatomy-and-physiology/pages/18-4-leukocytes-and-platelets',
  },
  krombach1997: {
    text: 'Krombach, F., et al. "Cell size of alveolar macrophages: an interspecies comparison." Environmental Health Perspectives 105(Suppl 5):1261–1263, 1997.',
    url: 'https://doi.org/10.1289/ehp.97105s51261',
  },
  'openstax-micro-bcell': {
    text: 'OpenStax Microbiology, section 18.4: B Lymphocytes and Humoral Immunity (primary and secondary responses).',
    url: 'https://openstax.org/books/microbiology/pages/18-4-b-lymphocytes-and-humoral-immunity',
  },
  'openstax-micro-tcell': {
    text: 'OpenStax Microbiology, section 18.3: T Lymphocytes and Cellular Immunity.',
    url: 'https://openstax.org/books/microbiology/pages/18-3-t-lymphocytes-and-cellular-immunity',
  },
  yoon2010: {
    text: 'Yoon, H., Kim, T. S., and Braciale, T. J. "The cell cycle time of CD8+ T cells responding in vivo is controlled by the type of antigenic stimulus." PLoS ONE 5(11):e15423, 2010.',
    url: 'https://doi.org/10.1371/journal.pone.0015423',
  },
  alaghbar2022: {
    text: 'Al-Aghbar, M. A., et al. "The interplay between membrane topology and mechanical forces in regulating T cell receptor activity." Communications Biology 5:40, 2022.',
    url: 'https://doi.org/10.1038/s42003-021-02995-1',
  },
  bjorkman1987: {
    text: 'Bjorkman, P. J., et al. "Structure of the human class I histocompatibility antigen, HLA-A2." Nature 329:506–512, 1987.',
    url: 'https://doi.org/10.1038/329506a0',
  },
  garboczi1996: {
    text: 'Garboczi, D. N., et al. "Structure of the complex between human T-cell receptor, viral peptide and HLA-A2." Nature 384:134–141, 1996.',
    url: 'https://doi.org/10.1038/384134a0',
  },
  law2010: {
    text: 'Law, R. H. P., et al. "The structural basis for membrane binding and pore formation by lymphocyte perforin." Nature 468:447–451, 2010.',
    url: 'https://doi.org/10.1038/nature09518',
  },
  fischl2000: {
    text: 'Fischl, B., and Dale, A. M. "Measuring the thickness of the human cerebral cortex from magnetic resonance images." PNAS 97(20):11050–11055, 2000.',
    url: 'https://doi.org/10.1073/pnas.200033797',
  },
  'wiki-neocortex': {
    text: 'Wikipedia. "Neocortex" (layers, columns, thickness).',
    url: 'https://en.wikipedia.org/wiki/Neocortex',
  },
  'tartu-cortex': {
    text: 'University of Tartu, Histology: "Cerebral cortex" (the six layers and their cells).',
    url: 'https://sisu.ut.ee/histology/cerebral-cortex/',
  },
  'wiki-patellar-reflex': {
    text: 'Wikipedia. "Patellar reflex" (segments L2–L4, monosynaptic arc, about 18 ms latency, reciprocal inhibition).',
    url: 'https://en.wikipedia.org/wiki/Patellar_reflex',
  },
  'oregon-reflexes': {
    text: 'Oregon State University, Anatomy & Physiology 2e, section 13.4: "Ventral Horn Output and Reflexes".',
    url: 'https://open.oregonstate.education/anatomy2e/chapter/ventral-horn-output-reflexes/',
  },
  'wiki-reaction-time': {
    text: 'Wikipedia. "Mental chronometry" (simple reaction times of about 160–220 ms).',
    url: 'https://en.wikipedia.org/wiki/Mental_chronometry',
  },
  'wiki-spinal-cord': {
    text: 'Wikipedia. "Spinal cord" (length, diameter, segments, enlargements, gray and white matter).',
    url: 'https://en.wikipedia.org/wiki/Spinal_cord',
  },
};
