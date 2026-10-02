// Scene registry: every dive step names one of these builders.
// Shared library scenes live in src/library/ and are listed here once;
// any dive that reaches them reuses the same builder.
import { buildBody, buildSkeletonScene } from './body.js';
import { buildFemur } from './femur.js';
import { buildBoneTissue } from './boneTissue.js';
import { buildOsteocyte } from './osteocyte.js';
import { buildHeart } from './heart.js';
import { buildBlood } from './blood.js';
import { buildRedBloodCell } from './redBloodCell.js';
import { buildMuscle } from './muscle.js';
import { buildFascicle } from './fascicle.js';
import { buildMuscleFiber } from './muscleFiber.js';
import { buildSarcomere } from './sarcomere.js';
import { buildLymphNode } from './lymphNode.js';
import { buildFollicle } from './follicle.js';
import { buildPlasmaCell } from './plasmaCell.js';
import { buildInflammation } from './inflammation.js';
import { buildBrain } from './brain.js';
import { buildNeuron } from './neuron.js';
import { buildSynapse } from './synapse.js';
import { buildLungs } from './lungs.js';
import { buildAlveoli } from './alveoli.js';
import { buildGasExchange } from './gasExchange.js';
import { buildNucleus } from '../library/nucleus.js';
import { buildDna } from '../library/dna.js';
import { buildHemoglobin } from '../library/hemoglobin.js';
import { buildHeme } from '../library/heme.js';
import { buildActinMyosin } from '../library/actinMyosin.js';
import { buildAntibody } from '../library/antibody.js';
import { buildNeurotransmitter } from '../library/neurotransmitter.js';
import { buildLipidBilayer } from '../library/lipidBilayer.js';
import { buildGases } from '../library/gases.js';

export const SCENES = {
  body: buildBody,
  skeleton: buildSkeletonScene,
  femur: buildFemur,
  'bone-tissue': buildBoneTissue,
  osteocyte: buildOsteocyte,
  heart: buildHeart,
  blood: buildBlood,
  'red-blood-cell': buildRedBloodCell,
  muscle: buildMuscle,
  fascicle: buildFascicle,
  'muscle-fiber': buildMuscleFiber,
  sarcomere: buildSarcomere,
  'lymph-node': buildLymphNode,
  follicle: buildFollicle,
  'plasma-cell': buildPlasmaCell,
  inflammation: buildInflammation,
  brain: buildBrain,
  neuron: buildNeuron,
  synapse: buildSynapse,
  lungs: buildLungs,
  alveoli: buildAlveoli,
  'gas-exchange': buildGasExchange,
  nucleus: buildNucleus,
  dna: buildDna,
  hemoglobin: buildHemoglobin,
  heme: buildHeme,
  'actin-myosin': buildActinMyosin,
  antibody: buildAntibody,
  neurotransmitter: buildNeurotransmitter,
  'lipid-bilayer': buildLipidBilayer,
  gases: buildGases,
};

export const SCENE_IDS = Object.keys(SCENES);
