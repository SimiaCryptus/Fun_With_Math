# Software Specification: Turn-Based Emergency Response Tactical Simulation Engine (Project PROTOCOL)

---

## 1. Executive Summary & System Overview

### 1.1 Purpose and Vision
Project PROTOCOL is an interactive, browser-based tactical simulation engine designed to teach crisis navigation, risk geometry, emergency protocols, and social dynamics to learners without relying on high-stress real-time panic mechanics or graphic trauma. By decomposing emergencies into turn-based tactical puzzles—akin to a modern systemic evolution of *The Oregon Trail* combined with turn-based grid tactics—the system affords students the cognitive decompression required to evaluate systemic trade-offs, explore non-ideal decisions, and understand causal failure modes in civil and institutional systems.

### 1.2 Core Architectural Principles
* **Decoupled Deterministic Simulation Engine:** The state machine and hazard propagation run independently of the presentation layer, enabling deterministic replays, branching state exploration, and non-real-time step evaluation.
* **Mechanism Over Morality:** Human interactions, panic, bullying, fights, and cooperation emerge organically from unified mathematical drivers ($Fear, Greed, Trust, Rage, Cohesion$) rather than hardcoded narrative scripts.
* **Abstracted, Non-Traumatic Outcomes:** Danger is communicated mathematically through spatial coverage, systemic debuffs (e.g., disorientation, reduced mobility, smoke inhalation, spatial displacement), and neutral state removals (tagged/evacuated) rather than sensationalized graphic trauma.
* **Pedagogical Autopsy (The Meta-Layer):** Every terminal state or completed turn can be inspected via an automated causal graph detailing why specific outcomes manifested (e.g., *"Door left open $\rightarrow$ Oxygen inflow accelerated thermal spread to Hallway B by 3 turns"*).
* **Zero-Build Native Web Stack:** Built on native Web standards using Modular ES6, modern HTML5 Custom Elements / Canvas overlays, and Three.js for isometric hardware-accelerated 3D tactical visualization.

---

## 2. Technology Stack & Directory Structure

### 2.1 Technology Stack
* **Language & Runtime:** Modern ECMAScript (ES2022+), native browser ES Modules (`<script type="module">`).
* **3D Rendering & Geometry:** Three.js (r128+) leveraging WebGL 2.0 with orthographic/isometric camera projection, custom GLSL shader overlays for line-of-sight and hazard fields.
* **UI & HUD Layer:** High-performance semantic HTML5, CSS Grid/Flexbox with CSS Custom Properties for dynamic HUD theming, and an SVG-based dynamic telemetry overlay.
* **Math & Spatial Acceleration:** Custom Spatial Hash Grid, A* Pathfinding with custom multi-objective cost matrices, and Bresenham-based 3D Line-of-Sight (LoS) Raycasting.

### 2.2 System Directory Structure
```
protocol-tactical-sim/
├── index.html                     # Entry HTML, canvas mount, telemetry HUD
├── css/
│   ├── main.css                   # Global styles, layout, reset
│   ├── hud.css                    # Tactical UI, Action Economy palette, turn banner
│   └── autopsy.css                # Post-incident causal graph and analytics view
├── src/
│   ├── main.js                    # Bootstrap, loop lifecycle, top-level event wiring
│   ├── core/
│   │   ├── Engine.js              # Central turn orchestrator and state coordinator
│   │   ├── EventBus.js            # Typed publish-subscribe event dispatcher
│   │   ├── GameState.js           # Immutable state snapshots & mutable active state
│   │   ├── TurnManager.js         # Phase coordinator (Player -> Hazards -> NPCs -> Resolution)
│   │   └── ActionEconomy.js       # Action Point (AP) ledger and cost validator
│   ├── spatial/
│   │   ├── Grid3D.js              # Multi-floor discrete volumetric voxel grid
│   │   ├── Tile.js                # Tile node (material properties, integrity, occlusion)
│   │   ├── Pathfinding.js         # Weighted A* with dynamic hazard cost fields
│   │   └── LineOfSight.js         # Shadow-casting & Bresenham field-of-view engine
│   ├── hazards/
│   │   ├── HazardManager.js       # Hazard lifecycle, diffusion, and tick processor
│   │   ├── FireModel.js           # Fuel, thermal transfer, oxygen, and door airflows
│   │   ├── SmokeModel.js          # Buoyancy, dispersion, opacity, and inhalation debuffs
│   │   ├── StructuralModel.js     # Structural load, collapse propagation, debris blocking
│   │   └── ThreatEntityModel.js   # Active human/external threat rule-based pathing
│   ├── social/
│   │   ├── NPCSpine.js            # Unified 5-variable psychological model
│   │   ├── BehaviorTree.js        # Deterministic behavioral arbitration engine
│   │   ├── DialogEngine.js        # State-driven diagnostic utterance generator
│   │   ├── RumorNetwork.js        # Information diffusion, distortion, and misintel graph
│   │   └── EscalationModel.js     # Bullying, fight initiation, and social friction
│   ├── render/
│   │   ├── SceneRenderer.js       # Three.js scene, isometric setup, render pipeline
│   │   ├── MapBuilder.js          # Procedural/declarative mesh constructor for floors/walls
│   │   ├── EntityRenderer.js      # Token meshes, visual state badges, animation tweens
│   │   ├── HazardRenderer.js      # Volumetric smoke shaders, fire particles, hazard overlays
│   │   └── FogOfWarOverlay.js     # Visual shader for unseen, explored, and visible tiles
│   ├── ui/
│   │   ├── HUDController.js       # DOM HUD bindings, AP counter, dynamic status cards
│   │   ├── ActionPalette.js       # Contextual action radial/action-bar UI
│   │   ├── DialogOverlay.js       # Speech bubble and social log rendering
│   │   └── AutopsyView.js         # Post-incident causal breakdown & decision tree UI
│   └── scenarios/
│       ├── ScenarioSchema.js      # JSON schema validation for scenario definitions
│       ├── FireEvacuation.js      # Chemistry lab thermal spread scenario
│       ├── ActiveThreat.js        # Lockdown, barricading, and line-of-sight scenario
│       └── EarthquakeTornado.js   # Structural integrity, shelter, and aftershock scenario
```

---

## 3. Data Models & State Schema

### 3.1 Global State Tree
The game state is structured as a single deterministic data tree. Every turn can be serialized to a raw JSON snapshot for step-by-step undo, replay, and causal analysis.

```typescript
interface GlobalState {
  meta: {
    turnNumber: number;
    activePhase: 'PLAYER_INPUT' | 'HAZARD_TICK' | 'NPC_TICK' | 'ENVIRONMENT_TICK' | 'AUTOPSY';
    scenarioId: string;
    seed: number;
    scenarioGoal: ScenarioGoal;
  };
  grid: {
    dimensions: { x: number; y: number; z: number }; // X, Y = floor plane, Z = vertical level
    tiles: Map<string, TileState>; // Keyed by coordinate hash "x,y,z"
  };
  player: {
    id: string;
    position: Coordinate3D;
    actionPoints: { max: number; current: number };
    physicalState: AgentPhysicalState;
    inventory: Item[];
    lineOfSight: Coordinate3D[];
  };
  npcs: Map<string, NPCState>;
  hazards: {
    fireCells: Map<string, FireCellState>;
    smokeCells: Map<string, SmokeCellState>;
    structuralIntegrity: Map<string, number>; // 0.0 to 1.0 per tile
    threatEntities: ThreatEntityState[];
  };
  social: {
    rumorGraph: RumorGraphState;
    groupCohesion: number; // Institutional panic damping factor
    alarmActive: boolean;
    responderEtaTurns: number;
  };
  telemetryLog: TurnTelemetryRecord[];
}
```

### 3.2 Coordinate & Tile Data Models
```typescript
interface Coordinate3D {
  x: number; // Grid Column (East-West)
  y: number; // Grid Row (North-South)
  z: number; // Elevation / Floor Index
}

interface TileState {
  coord: Coordinate3D;
  type: 'FLOOR' | 'WALL' | 'DOOR' | 'WINDOW' | 'STAIR' | 'EXIT' | 'CONTAINMENT';
  walkable: boolean;
  occludesVision: boolean;
  material: {
    flammability: number;     // 0.0 (Concrete) to 1.0 (Paper/Solvents)
    fuelCapacity: number;     // Total thermal energy potential in Joules/unit
    structuralMax: number;    // Maximum mechanical load before collapse
    soundTransmission: number;// Audio attenuation coefficient
  };
  doorState?: {
    isOpen: boolean;
    isLocked: boolean;
    isBarricaded: boolean;
    barricadeStrength: number; // Degradation threshold under brute force
    temperature: number;       // External surface temperature in Celsius
  };
  elevation: number;
}
```

---

## 4. Coordinate, Grid, & Visibility Systems

### 4.1 Grid Geometry & Spatial Indexing
* **Metric:** Discrete 3D Grid where each tile represents $1.5\text{m} \times 1.5\text{m} \times 3.0\text{m}$ of physical space.
* **Coordinate Hashing:** Fast $O(1)$ spatial queries via bit-packed or string-hashed coordinates:
  $$\text{Hash}(x, y, z) = (x \ \& \ 0\text{xFFFF}) \mid ((y \ \& \ 0\text{xFFFF}) \ll 16) \mid ((z \ \& \ 0\text{xFF}) \ll 32)$$
* **Adjacency:** 8-way directional connectivity on the XY plane (orthogonal cost $= 1.0$, diagonal cost $= 1.414$), with vertical traversal restricted to linked `STAIR` or `ELEVATOR_SHAFT` tiles.

### 4.2 Multi-Floor Volumetric Line of Sight (LoS)
Visibility is calculated from the player’s ocular coordinate using an octant-based 3D Bresenham Raycasting or Shadow-Casting algorithm.

```
       [Wall] (Blocks Ray & Light)
         ██
[Player] ───► [Tile A: Visible]
         ╲
          ╲──► [Smoke Cell] ──► [Tile B: Obscured / Reduced Accuracy]
```

1. **Vision States:**
    * `UNSEEN`: Tile has never been in LoS (Rendered pitch black or hidden).
    * `EXPLORED`: Previously observed; static geometry visible, dynamic entities/hazards hidden (Desaturated gray architectural blueprint).
    * `VISIBLE`: Real-time line-of-sight confirmed. All hazards, dynamic objects, and NPCs rendered with full telemetry.
2. **Smoke Attenuation:** Smoke density ($D \in [0.0, 1.0]$) absorbs visibility along rays:
   $$\text{Remaining Visibility} = V_0 \cdot \prod_{i=1}^{N} (1.0 - \alpha \cdot D_i)$$
   Where $\alpha$ is the smoke extinction coefficient ($0.65$). When $\text{Remaining Visibility} < 0.15$, ray propagation terminates.

---

## 5. Hazard Propagation Systems

```
+-------------------------------------------------------------------------+
|                        HAZARD SIMULATION TICK                           |
+-------------------------------------------------------------------------+
| 1. THERMAL CONVECTION  | 2. SMOKE BUOYANCY      | 3. STRUCTURAL LOADS   |
|   - Fuel Consumption   |   - Upward Displacement|   - Heat Weakening    |
|   - Conductive Transfer|   - Lateral Dispersion |   - Debris Fall       |
|   - Door Surface Heat  |   - Occlusion Update   |   - Path Blocking     |
+------------------------+------------------------+-----------------------+
```

### 5.1 Thermal & Fire Model
Fire is not randomized; it is a deterministic thermodynamic cellular automaton parameterized by fuel, oxygen, and temperature:

$$\Delta T_i = \left( \sum_{j \in \text{Neighbors}} \frac{K_{\text{cond}} \cdot (T_j - T_i)}{\text{dist}(i,j)} \right) + Q_{\text{combustion}}(i) - Q_{\text{loss}}(i)$$

* **Combustion Trigger:** If $T_i \ge T_{\text{ignition}}$ and $\text{Fuel}_i > 0$ and $\text{Oxygen}_i > 0.05$:
    * Combustion commences.
    * $\text{Oxygen}_i$ is consumed at rate $\beta_{\text{oxy}}$.
    * $\text{Smoke}_i$ is generated proportional to fuel burn rate.
    * $\text{DoorState.temperature}$ increases. Players checking doors touch a hot surface if $T > 55^\circ\text{C}$, exposing door opening risks.

### 5.2 Smoke & Toxic Gas Model
* **Buoyancy:** Smoke moves upwards ($Z + 1$) via open stairwells or double-height spaces until hitting a ceiling.
* **Lateral Spread:** Smoke spreads horizontally across adjacent non-wall cells when ceiling capacity is reached.
* **Inhalation Impact:**
    * Mild Exposure ($D \in [0.2, 0.5]$): Action Point (AP) maximum reduced by 1.
    * Heavy Exposure ($D > 0.5$): Movement cost doubled; disoriented pathing (15% chance to deviate by 45 degrees); cumulative lung irritation counter.

### 5.3 Active Threat & Non-Graphic Threat Dynamics
To preserve psychological safety while modeling lockdown dynamics, human or external physical threats operate on spatial rule-based vectors:
* **Perception Cone:** Threat has a forward $120^\circ$ vision cone of 12 tiles and a $360^\circ$ acoustic radius (triggered by running, yelling, door slamming).
* **State Machine:**
    * `PATROL`: Moves along defined systemic patrol routes.
    * `INVESTIGATE`: Moves toward last heard acoustic origin or open door.
    * `PURSUIT`: Moves along shortest direct path to visible target.
* **Barricade & Door Mechanics:** If a locked/barricaded door blocks the path, the threat expends turns applying force. Each turn decrements `barricadeStrength` based on structural resistance.
* **Non-Graphic Resolution:** Reaching a target cell "tags" the entity, removing them from the active tactical grid into the triage/evacuated ledger with zero graphic depiction.

---

## 6. Unified NPC Psychological & Behavioral Spine

### 6.1 The 5-Variable Psychological Vector
Every dynamic non-player agent possesses five orthogonal psychological traits normalized on $[0.0, 1.0]$:

| Trait | Symbol | Meaning in Crisis Simulation |
| :--- | :---: | :--- |
| **Fear** | $F$ | Direct flight impulse, self-preservation, hyper-reactivity to sensory hazards. |
| **Greed** | $G$ | Preservation of personal belongings, self-serving resource retention, exit hoarding. |
| **Trust** | $T$ | Willingness to follow player instructions, share resources, and accept orders. |
| **Rage** | $R$ | Reactive aggression, resistance to authority, impulse to physically push or fight. |
| **Cohesion** | $C$ | Institutional identification, group loyalty, adherence to collective protocols. |

### 6.2 Derived Dynamic States
At the start of each NPC phase, secondary behavioral drivers are computed mathematically:

$$\begin{aligned}
\text{Stress} &= \text{clamp}(F \cdot 0.7 + R \cdot 0.3 + \text{HazardProximityFactor}, 0, 1) \\
\text{Confidence} &= \text{clamp}(T \cdot 0.5 + C \cdot 0.5 - \text{Stress} \cdot 0.4, 0, 1) \\
\text{Aggression} &= \text{clamp}(R \cdot 0.6 + G \cdot 0.4 - T \cdot 0.3, 0, 1) \\
\text{Empathy} &= \text{clamp}(T \cdot 0.5 + C \cdot 0.3 - F \cdot 0.4, 0, 1) \\
\text{RiskTolerance} &= \text{clamp}(\text{Confidence} \cdot 0.7 - \text{Stress} \cdot 0.3, 0, 1)
\end{aligned}$$

```
+--------------------------------------------------------------------+
|                      PSYCHOLOGICAL STATE GRAPH                     |
+--------------------------------------------------------------------+
|  [Fear]      ───► ( + ) ──► [ Stress ] ──► Freeze / Flee / Wander  |
|  [Rage]      ───► ( + ) ──► [ Aggression ] ──► Bully / Push / Fight|
|  [Trust]     ───► ( + ) ──► [ Empathy ] ──► Help / Cooperate       |
|  [Cohesion]  ───► ( + ) ──► [ Confidence ] ──► Follow / Barricade  |
+--------------------------------------------------------------------+
```

### 6.3 Deterministic Behavior Arbitration
NPC decisions are governed by deterministic utility scoring across a discrete set of tactical behaviors:

```typescript
function arbitrateNPCBehavior(npc: NPCState, context: TacticalContext): Action {
  // 1. FREEZE THRESHOLD: Extreme fear paralyzes agency
  if (npc.derived.stress > 0.85 && npc.derived.confidence < 0.2) {
    return new Action('FREEZE', { duration: 1, reason: 'Paralyzing panic' });
  }

  // 2. SOCIAL FRICTION & ESCALATION (Bullying / Fight)
  if (context.isLowImmediateDanger && npc.derived.aggression > 0.75) {
    const target = context.nearbyAgents.find(other => other.socialRank < npc.socialRank);
    if (target && target.traits.trust < 0.4) {
      return new Action('ESCALATE_CONFLICT', { targetId: target.id, type: 'BULLY_INTIMIDATE' });
    }
  }

  // 3. COOPERATIVE PROTOCOL ADHERENCE
  if (npc.traits.cohesion > 0.6 && context.activeAlarm && npc.derived.stress < 0.7) {
    return new Action('EXECUTE_DRILL_PROTOCOL', { designatedExit: context.nearestStandardExit });
  }

  // 4. EVASION & FLIGHT
  if (npc.derived.stress > 0.5) {
    return new Action('FLEE_FROM', { threatOrigin: context.nearestHazardLocation });
  }

  // 5. DEFAULT COGNITIVE WANDERING
  return new Action('SEEK_INFORMATION', { targetTile: context.nearestUnexploredTile });
}
```

---

## 7. Social Cognition, Dialog, & Rumor Propagation Engine

### 7.1 State-Driven Diagnostic Dialog
Dialog is not scripted narrative; it functions as **diagnostic visual telemetry** reflecting an agent's internal state machine:

```
[Agent State: Rage=0.8, Stress=0.7] ──► Utterance: "Move! Stop blocking the exit!"
[Agent State: Trust=0.9, Conf=0.8]  ──► Utterance: "Stay low. I've got your back."
[Agent State: Fear=0.9, Conf=0.1]   ──► Utterance: "We're trapped! The stairs are gone!"
```

### 7.2 Rumor & Misinformation Diffusion Network
Information propagates via spatial acoustics across an adjacency graph. A rumor node contains:
* `claimType`: e.g., `EXIT_BLOCKED`, `THREAT_LOCATION`, `FIRE_CONTAINED`.
* `veracity`: Boolean ($true = \text{ground truth}, false = \text{misinformation}$).
* `confidenceScore`: $[0.0, 1.0]$.
* `distortionFactor`: Cumulative delta applied per transmission.

```
Agent A (Sees Smoke on Floor 2)
  │
  ▼ [Transmits: "Smoke in South Wing"]
Agent B (Stress=0.8, Fear=0.9)
  │
  ▼ [Distorts via high Fear: "Whole South Wing is on Fire!"]
Agent C (Fleeing North, spreads distorted rumor to North Classrooms)
```

**Distortion Formula on Handoff:**
$$\text{DistortionChance} = \text{clamp}(\text{Listener.Stress} \cdot 0.6 + (1.0 - \text{Speaker.Trust}) \cdot 0.4, 0, 1)$$
If triggered, the claim severity escalates or direction flips, causing NPCs to navigate directly toward hazards or barricade safe routes prematurely.

---

## 8. Player Action Economy & Turn Resolution Pipeline

### 8.1 Action Point (AP) Ledger
* The player is allocated **$4 \text{ AP}$ per turn** under baseline conditions.
* Physical debuffs (smoke inhalation, carry load, injury) reduce base AP or increase action costs.

```
+-------------------------+--------+------------------------------------------+
| ACTION                  | AP COST| SYSTEMIC EFFECT                          |
+-------------------------+--------+------------------------------------------+
| Move (Orthogonal)       | 1 AP   | Traverses 1 clear tile                   |
| Move (Diagonal/Smoke)   | 2 AP   | Traverses difficult terrain              |
| Open/Close Door         | 1 AP   | Alters thermal/air boundary & LoS        |
| Check Door Temperature  | 1 AP   | Diagnoses thermal danger safely          |
| Barricade Door (Item)   | 2 AP   | Adds 50 Structural HP to door closure    |
| Clear Obstacle/Debris   | 2 AP   | Restores walkability to tile             |
| De-escalate NPC (Verbal)| 1 AP   | Lowers NPC Rage by 0.35, raises Trust 0.2|
| Assist / Carry NPC      | 2 AP   | Couples movement; shares smoke debuff    |
| Sound Alarm / Intercom  | 1 AP   | Updates collective Cohesion & broadcasts |
+-------------------------+--------+------------------------------------------+
```

### 8.2 Execution Phase Pipeline

```
+───────────────────────────────────────────────────────────────────────────+
|                       TURN EXECUTION TIMELINE                             |
+───────────────────────────────────────────────────────────────────────────+
| [PHASE 1: Player Input]                                                   |
|   Player queues actions -> AP decremented -> Local validation             |
|                                                                           |
| [PHASE 2: Player Resolution]                                              |
|   Actions applied to grid state -> Physical interaction resolved          |
|                                                                           |
| [PHASE 3: Hazard Propagation]                                             |
|   Fire diffusion -> Thermal conduction -> Smoke transport -> Decay        |
|                                                                           |
| [PHASE 4: Social & Threat Entities]                                       |
|   Threat pathing -> NPC behavior arbitration -> Social conflict/rumors    |
|                                                                           |
| [PHASE 5: Environmental & State Check]                                    |
|   Structural load -> Inhalation debuffs -> Goal checks -> Telemetry save  |
|                                                                           |
| [PHASE 6: Rendering & UI Update]                                          |
|   Interpolation tweens -> Camera focus -> HUD sync -> Unlock player input  |
+───────────────────────────────────────────────────────────────────────────+
```

---

## 9. 3D Isometric Rendering Engine (Three.js)

### 9.1 Scene Topology & Orthographic Projection
To maintain tactical clarity without perspective distortion:
* **Camera:** `THREE.OrthographicCamera` configured at an isometric angle ($45^\circ$ azimuth, $\approx 35.264^\circ$ elevation / true isometric projection).
* **Grid Units:** $1 \text{ World Unit} = 1.5 \text{ Meters}$.

```javascript
const aspect = window.innerWidth / window.innerHeight;
const d = 14; // Frustum size
const camera = new THREE.OrthographicCamera(
  -d * aspect, d * aspect, d, -d, 0.1, 1000
);
// Standard Isometric Viewing Angle
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);
```

```
       +Y (Up)
        |     +Z (Isometric Axis)
        |    /
        |   /
        |  /
        | /
        +────────── +X (Isometric Axis)
```

### 9.2 Custom Shaders & Visual Representation
1. **Volumetric Hazard Shader (Smoke & Heat):**
    * Smoke is rendered as instanced geometry quads with a custom fragment shader incorporating 3D Perlin noise and alpha falloff based on density.
    * Heated surfaces emit a pulsing subtle infrared wireframe glow, communicating tactile temperature visually without UI clutter.
2. **Dynamic Fog of War Multi-Pass Shader:**
    * Custom post-processing or tile material blending pass multiplying tile diffuse by visibility mask:
      $$\text{Fragment Color} = \text{Texture Color} \cdot (\text{Visibility} \cdot 0.85 + \text{Explored} \cdot 0.15)$$

---

## 10. Scenario Declarative DSL Schema

Scenarios are authored declaratively via structured JSON schemas, separating scenario design from core engine code.

### 10.1 Scenario JSON Schema Specification
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProtocolScenarioDefinition",
  "type": "object",
  "required": ["id", "title", "gridSize", "initialHazards", "agents", "winConditions"],
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "gridSize": {
      "type": "object",
      "properties": {
        "x": { "type": "integer" },
        "y": { "type": "integer" },
        "z": { "type": "integer" }
      }
    },
    "mapLayout": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "x": { "type": "integer" },
          "y": { "type": "integer" },
          "z": { "type": "integer" },
          "type": { "type": "string", "enum": ["FLOOR", "WALL", "DOOR", "WINDOW", "STAIR", "EXIT"] },
          "flammability": { "type": "number" },
          "doorState": { "type": "object" }
        }
      }
    },
    "initialHazards": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["FIRE", "SMOKE", "STRUCTURAL_WEAKNESS", "THREAT"] },
          "position": { "type": "object" },
          "intensity": { "type": "number" }
        }
      }
    },
    "agents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "role": { "type": "string", "enum": ["STUDENT", "TEACHER", "RESPONDER", "BYSTANDER"] },
          "position": { "type": "object" },
          "traits": {
            "type": "object",
            "properties": {
              "fear": { "type": "number" },
              "greed": { "type": "number" },
              "trust": { "type": "number" },
              "rage": { "type": "number" },
              "cohesion": { "type": "number" }
            }
          }
        }
      }
    },
    "winConditions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["EVACUATE_MINIMUM_PERCENT", "CONTAIN_HAZARD", "SURVIVE_TURNS", "PREVENT_CASUALTIES"] },
          "targetValue": { "type": "number" }
        }
      }
    }
  }
}
```

---

## 11. Pedagogical Autopsy Engine (The Meta-Layer)

### 11.1 Causal Graph Generation
The Autopsy Engine parses the `TurnTelemetryRecord` ledger to construct a Directed Acyclic Graph (DAG) of cause-and-effect turning points.

```
[Turn 02: Player leaves Fire Door open]
       │
       ▼ (Oxygen Influx Rate: +40%)
[Turn 04: Fire jumps across corridor into Stairwell A]
       │
       ▼ (Blocked Primary Exit)
[Turn 07: NPC group panics and enters Hallway B]
       │
       ▼ (Dense Smoke Exposure)
[Turn 09: 3 NPCs incapacitated by Smoke Inhalation]
```

### 11.2 The "What If" Counterfactual Branch Analyzer
For critical failure nodes, the Autopsy Engine evaluates counterfactual branches by running deterministic sub-simulations from historical state snapshots:
* **Counterfactual:** What if the player spent 1 AP to close the fire door on Turn 2?
* **Computed Delta:** Fire propagation to Stairwell A delayed by 6 turns; Evacuation success rate increases from $40\%$ to $90\%$.
* **Pedagogical Takeaway:** Displays the institutional mechanism: *"Fire doors contain oxygen flow and isolate thermal energy. Closing doors saves lives even when actively evacuating."*

---

## 12. Modular ES6 Class Architecture & Code Contracts

### 12.1 Engine Kernel (`src/core/Engine.js`)
```javascript
import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { TurnManager } from './TurnManager.js';
import { HazardManager } from '../hazards/HazardManager.js';
import { SceneRenderer } from '../render/SceneRenderer.js';
import { HUDController } from '../ui/HUDController.js';

export class Engine {
  /**
   * @param {HTMLElement} container - Canvas mounting target
   * @param {Object} scenarioData - Validated Scenario JSON
   */
  constructor(container, scenarioData) {
    this.container = container;
    this.eventBus = new EventBus();
    this.state = new GameState(scenarioData);
    this.turnManager = new TurnManager(this.state, this.eventBus);
    this.hazardManager = new HazardManager(this.state, this.eventBus);
    this.renderer = new SceneRenderer(container, this.state, this.eventBus);
    this.hud = new HUDController(document.getElementById('hud-root'), this.state, this.eventBus);

    this._bindEvents();
  }

  /**
   * Initializes scene, builds voxel grid meshes, and starts render loop
   */
  async init() {
    await this.renderer.init();
    this.renderer.buildMapFromState();
    this.turnManager.startTurn();
    this._startRenderLoop();
    this.eventBus.emit('ENGINE_INITIALIZED', { scenarioId: this.state.meta.scenarioId });
  }

  /**
   * Core requestAnimationFrame render loop
   */
  _startRenderLoop() {
    const loop = (timestamp) => {
      this.renderer.render(timestamp);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Dispatches player action to active turn
   * @param {Object} actionDescriptor
   */
  dispatchPlayerAction(actionDescriptor) {
    if (this.state.meta.activePhase !== 'PLAYER_INPUT') {
      console.warn('Action rejected: Not in PLAYER_INPUT phase.');
      return false;
    }
    return this.turnManager.processPlayerAction(actionDescriptor);
  }

  _bindEvents() {
    this.eventBus.on('STEP_TURN_REQUESTED', () => this.turnManager.commitTurn());
    this.eventBus.on('RELOAD_SCENARIO', (data) => this.reload(data.scenarioData));
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
    this.hud.dispose();
    this.eventBus.clear();
  }
}
```

### 12.2 Psychological & Behavior Spine (`src/social/NPCSpine.js`)
```javascript
export class NPCSpine {
  /**
   * Computes derived emotional and cognitive states from the 5 base traits
   * @param {Object} traits - { fear, greed, trust, rage, cohesion }
   * @param {Object} context - Environmental and sensory factors
   * @returns {Object} Derived state vector
   */
  static evaluateDerivedState(traits, context) {
    const hazardProximityFactor = Math.max(0, 1.0 - (context.nearestHazardDistance / 10.0));
    const stress = Math.min(1.0, Math.max(0.0,
      traits.fear * 0.7 + traits.rage * 0.3 + hazardProximityFactor * 0.5
    ));

    const confidence = Math.min(1.0, Math.max(0.0,
      traits.trust * 0.5 + traits.cohesion * 0.5 - stress * 0.4
    ));

    const aggression = Math.min(1.0, Math.max(0.0,
      traits.rage * 0.6 + traits.greed * 0.4 - traits.trust * 0.3
    ));

    const empathy = Math.min(1.0, Math.max(0.0,
      traits.trust * 0.5 + traits.cohesion * 0.3 - traits.fear * 0.4
    ));

    const riskTolerance = Math.min(1.0, Math.max(0.0,
      confidence * 0.7 - stress * 0.3
    ));

    return { stress, confidence, aggression, empathy, riskTolerance };
  }

  /**
   * Evaluates diagnostic dialog key from derived state and local triggers
   * @param {Object} npc - NPC state entity
   * @param {Object} context - Contextual social triggers
   * @returns {string} Dialog phrase key
   */
  static selectDiagnosticDialog(npc, context) {
    const { stress, aggression, confidence } = npc.derived;

    if (stress > 0.85) return 'PANIC_FREEZE';
    if (aggression > 0.75 && context.hasSocialFriction) return 'BULLY_AGGRESSION';
    if (confidence > 0.7 && npc.traits.cohesion > 0.6) return 'LEADERSHIP_CALM';
    if (context.hazardVisible && stress > 0.5) return 'WARN_HAZARD';
    if (npc.traits.greed > 0.8 && stress > 0.4) return 'GREED_BELONGINGS';

    return 'STATUS_IDLE';
  }
}
```

### 12.3 Hazard Propagation Module (`src/hazards/HazardManager.js`)
```javascript
export class HazardManager {
  constructor(state, eventBus) {
    this.state = state;
    this.eventBus = eventBus;
  }

  /**
   * Executes a full tick across all hazard dimensions
   */
  processHazardTick() {
    const grid = this.state.grid;
    const fireDeltas = new Map();
    const smokeDeltas = new Map();

    // 1. Thermal conduction & combustion loop
    for (const [key, fireCell] of this.state.hazards.fireCells.entries()) {
      const [x, y, z] = key.split(',').map(Number);
      const tile = grid.tiles.get(key);

      if (fireCell.intensity > 0) {
        // Consume fuel and oxygen
        fireCell.fuel = Math.max(0, fireCell.fuel - fireCell.burnRate);
        tile.material.structuralMax -= fireCell.intensity * 2.0;

        // Spread to adjacent permeable cells
        const neighbors = this._getNeighbors(x, y, z);
        for (const nKey of neighbors) {
          const nTile = grid.tiles.get(nKey);
          if (nTile && nTile.walkable && nTile.material.flammability > 0.1) {
            const currentThermal = fireDeltas.get(nKey) || 0;
            const spreadChance = nTile.material.flammability * fireCell.intensity * 0.4;
            if (Math.random() < spreadChance) {
              fireDeltas.set(nKey, currentThermal + 0.3);
            }
          }
        }

        // Generate Smoke
        const smokeLevel = smokeDeltas.get(key) || 0;
        smokeDeltas.set(key, Math.min(1.0, smokeLevel + 0.4));
      }
    }

    // 2. Commit fire updates
    for (const [key, addedIntensity] of fireDeltas.entries()) {
      if (!this.state.hazards.fireCells.has(key)) {
        this.state.hazards.fireCells.set(key, {
          intensity: addedIntensity,
          fuel: 100,
          burnRate: 5
        });
        this.eventBus.emit('HAZARD_SPAWNED', { type: 'FIRE', key });
      }
    }

    // 3. Smoke diffusion pass
    this._diffuseSmoke(smokeDeltas);

    this.eventBus.emit('HAZARDS_UPDATED', {
      fireCount: this.state.hazards.fireCells.size,
      smokeCount: this.state.hazards.smokeCells.size
    });
  }

  _getNeighbors(x, y, z) {
    return [
      `${x+1},${y},${z}`, `${x-1},${y},${z}`,
      `${x},${y+1},${z}`, `${x},${y-1},${z}`
    ];
  }

  _diffuseSmoke(smokeDeltas) {
    for (const [key, density] of smokeDeltas.entries()) {
      const existing = this.state.hazards.smokeCells.get(key) || { density: 0 };
      existing.density = Math.min(1.0, existing.density + density);
      this.state.hazards.smokeCells.set(key, existing);
    }
  }
}
```

### 12.4 Three.js Scene Renderer (`src/render/SceneRenderer.js`)
```javascript
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class SceneRenderer {
  constructor(container, state, eventBus) {
    this.container = container;
    this.state = state;
    this.eventBus = eventBus;

    this.scene = new THREE.Scene();
    this.tileMeshes = new Map();
    this.entityMeshes = new Map();
    this.hazardMeshes = new Map();
  }

  async init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;
    const d = 16;

    this.camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect, d, -d, 1, 1000
    );
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
    this._setupLighting();
    this._bindResize();
  }

  _setupLighting() {
    this.scene.background = new THREE.Color(0x0f141c); // Dark tactical slate

    const ambientLight = new THREE.AmbientLight(0xdde6f0, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(15, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);
  }

  buildMapFromState() {
    const floorGeo = new THREE.BoxGeometry(1.48, 0.1, 1.48);
    const wallGeo = new THREE.BoxGeometry(1.48, 2.0, 1.48);

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x242d38 });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x475569 });

    for (const [key, tile] of this.state.grid.tiles.entries()) {
      const { x, y, z } = tile.coord;
      const geo = tile.type === 'WALL' ? wallGeo : floorGeo;
      const mat = tile.type === 'WALL' ? wallMat : floorMat;
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(x * 1.5, z * 2.0 + (tile.type === 'WALL' ? 1.0 : 0.0), y * 1.5);
      mesh.receiveShadow = true;
      mesh.castShadow = (tile.type === 'WALL');

      this.scene.add(mesh);
      this.tileMeshes.set(key, mesh);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const aspect = width / height;
      const d = 16;

      this.camera.left = -d * aspect;
      this.camera.right = d * aspect;
      this.camera.top = d;
      this.camera.bottom = -d;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
```

---

## 13. UI Architecture, Accessibility & Visual Styling

### 13.1 HTML5 Single-Page Mount Architecture (`index.html`)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PROTOCOL // Tactical Emergency Simulation</title>
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/hud.css">
  <link rel="stylesheet" href="css/autopsy.css">
</head>
<body>
  <div id="sim-app">
    <!-- 3D WebGL Canvas Viewport -->
    <main id="viewport-container" role="region" aria-label="Tactical Simulation Map"></main>

    <!-- Top Telemetry Header -->
    <header id="hud-header" class="hud-panel">
      <div class="hud-group">
        <span class="hud-badge" id="hud-scenario-title">SCENARIO: CHEMISTRY LAB EVACUATION</span>
        <span class="hud-badge" id="hud-turn-counter">TURN: 01</span>
      </div>
      <div class="hud-group">
        <span class="hud-meter-label">ALARM:</span>
        <span class="hud-indicator active" id="hud-alarm-status">BROADCASTING</span>
        <span class="hud-meter-label">RESPONDERS:</span>
        <span class="hud-badge" id="hud-responder-eta">ETA 5 TURNS</span>
      </div>
    </header>

    <!-- Bottom Action & AP Dashboard -->
    <footer id="hud-action-bar" class="hud-panel">
      <div id="ap-ledger-container" aria-label="Action Points Available">
        <span class="ap-title">AP:</span>
        <div class="ap-pip active"></div>
        <div class="ap-pip active"></div>
        <div class="ap-pip active"></div>
        <div class="ap-pip active"></div>
      </div>

      <nav id="action-palette" aria-label="Tactical Actions">
        <button class="action-btn" data-action="MOVE" accesskey="m">
          <span class="key">M</span>ove (1 AP)
        </button>
        <button class="action-btn" data-action="CHECK_DOOR" accesskey="c">
          <span class="key">C</span>heck Door (1 AP)
        </button>
        <button class="action-btn" data-action="BARRICADE" accesskey="b">
          <span class="key">B</span>arricade (2 AP)
        </button>
        <button class="action-btn" data-action="ASSIST" accesskey="a">
          <span class="key">A</span>ssist NPC (2 AP)
        </button>
        <button class="action-btn primary" id="btn-end-turn" accesskey="e">
          <span class="key">E</span>nd Turn
        </button>
      </nav>
    </footer>

    <!-- Overlay Layer (Dialog Speech Bubbles & Autopsy Graph) -->
    <div id="dialog-overlay-layer" aria-live="polite"></div>
    <section id="autopsy-modal" class="modal-hidden" aria-modal="true" role="dialog"></section>
  </div>

  <script type="module" src="src/main.js"></script>
</body>
</html>
```

### 13.2 Visual Styling System (`css/hud.css`)
```css
:root {
  --bg-slate: #0b0f17;
  --panel-bg: rgba(17, 24, 39, 0.88);
  --panel-border: #2e3c54;
  --accent-cyan: #38bdf8;
  --accent-amber: #f59e0b;
  --accent-red: #ef4444;
  --accent-green: #10b981;
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --font-mono: 'JetBrains Mono', 'Courier New', Courier, monospace;
}

#hud-header {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  backdrop-filter: blur(8px);
  border-radius: 4px;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  z-index: 10;
}

#hud-action-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 12px 24px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  z-index: 10;
}

.ap-pip {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  background: #1e293b;
  border: 1px solid var(--accent-cyan);
  display: inline-block;
  margin-right: 4px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.ap-pip.active {
  background: var(--accent-cyan);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}

.action-btn {
  background: #1e293b;
  color: var(--text-main);
  border: 1px solid var(--panel-border);
  padding: 8px 14px;
  border-radius: 4px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: #334155;
  border-color: var(--accent-cyan);
}

.action-btn.primary {
  background: #0284c7;
  border-color: #38bdf8;
  font-weight: bold;
}
```

---

## 14. Verification, Performance, & Security Considerations

### 14.1 Performance Targets & Optimization Strategy
* **Framerate:** Steady $60\text{ FPS}$ render cycle on mid-tier integrated graphics (Intel Iris Xe / Apple M1 or equivalent).
* **Draw Call Optimization:** Map tiles, static architectural walls, and recurring prop meshes are batched using `THREE.InstancedMesh` per material, capping scene draw calls under 30 total.
* **Spatial Partitioning:** Spatial Hash Grid enables $O(1)$ coordinate lookup and ray collisions; pathfinding runs on pre-computed weight matrices without allocating per-frame garbage.
* **Garbage Collection Free Tick Loop:** State transitions re-use fixed array buffers for neighbor queries and path results to eliminate memory churn during turn execution.

### 14.2 Psychological Safety & Educational Compliance
* **Content Filter & Abstraction:** No rendering of blood, physical lacerations, or graphic trauma. Entities requiring assistance display standard symbolic HUD badges (e.g., `DISORIENTED`, `SLOWED`, `NEED_ASSIST`).
* **Deterministic Reversibility:** Learners can step backward through the turn stack using the `TurnManager.rewindTo(turnIndex)` API, fostering experimentation without punitive failure anxiety.
* **Clear Protocol Alignment:** All hazard outcomes correlate directly with empirical disaster response guidelines (e.g., FEMA, NFPA, and ALICE protocols).

---

## 15. Implementation Blueprint & Phase Deliverables

```
+────────────────────────────────────────────────────────────────────────────+
| PHASE 1: Core Engine & Deterministic Grid                                  |
|   - Multi-floor 3D Grid & Spatial Hash System                              |
|   - TurnManager, EventBus, Action Point Ledger                             |
|   - Three.js Isometric Orthographic Renderer & Tile Batching               |
+────────────────────────────────────────────────────────────────────────────+
                                      │
                                      ▼
+────────────────────────────────────────────────────────────────────────────+
| PHASE 2: Hazard Dynamics & LoS Raycasting                                  |
|   - Thermal Combustion, Conduction & Airflow Solver                        |
|   - Smoke Buoyancy, Dispersion, and Inhalation Math                        |
|   - Octant Shadow-Casting Multi-Floor Line-of-Sight                        |
+────────────────────────────────────────────────────────────────────────────+
                                      │
                                      ▼
+────────────────────────────────────────────────────────────────────────────+
| PHASE 3: Psychological NPC Spine & Social Engine                           |
|   - 5-Variable Trait Vector -> Derived Cognitive States                    |
|   - Behavioral Utility Decision Arbiter (Freeze, Egress, Bully, Cooperate) |
|   - Diagnostic Utterance Dialog Engine & Rumor Graph Diffusion             |
+────────────────────────────────────────────────────────────────────────────+
                                      │
                                      ▼
+────────────────────────────────────────────────────────────────────────────+
| PHASE 4: Scenarios, Telemetry & Autopsy Meta-Layer                         |
|   - Declarative JSON DSL Loaders (Fire, Lockdown, Tornado)                 |
|   - Causal DAG Construction & Counterfactual Branch Runner                 |
|   - Full Screen Post-Incident Pedagogical Autopsy UI                       |
+────────────────────────────────────────────────────────────────────────────+
```

This specification represents the complete architectural and operational standard for the Project PROTOCOL turn-based tactical emergency simulation engine.
