import { io } from "socket.io-client";
import {
    Engine,
    Scene,
    FollowCamera,
    HemisphericLight,
    DirectionalLight,
    ShadowGenerator,
    SpotLight,
    MeshBuilder,
    Vector3,
    PhysicsImpostor,
    StandardMaterial,
    MultiMaterial,
    SubMesh,
    Color3,
    ActionManager,
    KeyboardEventTypes
} from "@babylonjs/core";
import { CannonJSPlugin } from "@babylonjs/core/Physics";
import * as CANNON from "cannon-es";
import "./style.css";

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const socket = io(import.meta.env.VITE_SOCKET_URL);

const canvas = document.querySelector("#game");
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color3(1, 0.98, 0.94);
scene.enablePhysics(new Vector3(0, -9.81, 0), new CannonJSPlugin(true, 10, CANNON));

const camera = new FollowCamera("FollowCam", new Vector3(0, 10, -20), scene);
camera.radius = 30;
camera.heightOffset = 10;
camera.rotationOffset = -90;
camera.cameraAcceleration = 0.05;
camera.maxCameraSpeed = 20;

const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
hemiLight.intensity = 0.5;
hemiLight.diffuse = new Color3(1, 1, 1);
hemiLight.specular = new Color3(1, 1, 1);
hemiLight.groundColor = new Color3(0.5, 0.5, 0.5);

const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
dirLight.position = new Vector3(100, 200, 100);
dirLight.intensity = 1.2;

const shadowGenerator = new ShadowGenerator(1024, dirLight);
shadowGenerator.useExponentialShadowMap = true;

let player, playerMaterial, caughtMaterial;

function createPlayer() {
    player = MeshBuilder.CreateBox("player", { size: 5 }, scene);
    player.position = new Vector3(-340, 10, randomBetween(-90, 90));
    player.physicsImpostor = new PhysicsImpostor(player, PhysicsImpostor.BoxImpostor, {
        mass: 1,
        restitution: 0.2
    }, scene);
    player.physicsImpostor.physicsBody.angularFactor.set(0, 0, 0);

    playerMaterial = new StandardMaterial("playerMat", scene);
    playerMaterial.diffuseColor = new Color3(0.2, 0.5, 1);
    player.material = playerMaterial;

    caughtMaterial = new StandardMaterial("caughtMat", scene);
    caughtMaterial.diffuseColor = new Color3(1, 0, 0);

    camera.lockedTarget = player;
    shadowGenerator.addShadowCaster(player);

    setInterval(() => {
        if (player) {
            socket.emit("updatePosition", {
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                },
                color: player.material.diffuseColor.toHexString()
            });
        }
    }, 50);
}

const dollMaterial = new StandardMaterial("dollMat", scene);
dollMaterial.diffuseColor = new Color3(0.5, 0.8, 0.6);
dollMaterial.emissiveColor = new Color3(0.2, 0.3, 0.2);

const frontFaceMaterial = new StandardMaterial("frontMat", scene);
frontFaceMaterial.diffuseColor = new Color3(1, 0, 0);
frontFaceMaterial.emissiveColor = new Color3(0.3, 0, 0);

const doll = MeshBuilder.CreateBox("doll", { size: 30, wrap: true }, scene);
const multiMat = new MultiMaterial("multi", scene);
multiMat.subMaterials.push(dollMaterial, dollMaterial, dollMaterial, frontFaceMaterial, dollMaterial, dollMaterial);
doll.material = multiMat;
doll.subMeshes = [];
const verticesCount = doll.getTotalVertices();
let indexStart = 0;
for (let i = 0; i < 6; i++) {
    doll.subMeshes.push(new SubMesh(i, 0, verticesCount, indexStart, 6, doll));
    indexStart += 6;
}
doll.position = new Vector3(330, 15, 0);

const spotLight = new SpotLight("spotLight", new Vector3(330, 60, 0), new Vector3(0, -1, 0), Math.PI / 3, 2, scene);
spotLight.intensity = 1.5;

const ground = MeshBuilder.CreateBox("ground", { width: 700, height: 2, depth: 200 }, scene);
ground.physicsImpostor = new PhysicsImpostor(ground, PhysicsImpostor.BoxImpostor, {
    mass: 0,
    restitution: 0.5
}, scene);
const groundMaterial = new StandardMaterial("groundMat", scene);
groundMaterial.diffuseColor = new Color3(0.5, 0.6, 0.8);
groundMaterial.backFaceCulling = false;
ground.material = groundMaterial;
ground.receiveShadows = true;

const grassMaterial = new StandardMaterial("grassMat", scene);
grassMaterial.diffuseColor = new Color3(0.1, 0.6, 0.1);

const groundWidth = 700;
const groundDepth = 200;
const grassSize = 4;
const spacing = 15;
const halfWidth = groundWidth / 2;
const halfDepth = groundDepth / 2;

for (let x = -halfWidth; x <= halfWidth; x += spacing) {
    let grass1 = MeshBuilder.CreateBox("grass", { size: grassSize }, scene);
    grass1.material = grassMaterial;
    grass1.position = new Vector3(x, 2, -halfDepth);
    let grass2 = MeshBuilder.CreateBox("grass", { size: grassSize }, scene);
    grass2.material = grassMaterial;
    grass2.position = new Vector3(x, 2, halfDepth);
}

for (let z = -halfDepth + spacing; z <= halfDepth - spacing; z += spacing) {
    let grass3 = MeshBuilder.CreateBox("grass", { size: grassSize }, scene);
    grass3.material = grassMaterial;
    grass3.position = new Vector3(-halfWidth, 2, z);
    let grass4 = MeshBuilder.CreateBox("grass", { size: grassSize }, scene);
    grass4.material = grassMaterial;
    grass4.position = new Vector3(halfWidth, 2, z);
}

const inputMap = {};
scene.actionManager = new ActionManager(scene);
scene.onKeyboardObservable.add((kbInfo) => {
    const key = kbInfo.event.key.toLowerCase();
    inputMap[key] = kbInfo.type === KeyboardEventTypes.KEYDOWN;
});

let dollFacingPlayer = false;
const otherPlayers = {};

scene.onBeforeRenderObservable.add(() => {
    if (player) {
        const speed = 20;
        const direction = Vector3.Zero();
        if (inputMap["w"]) direction.x += 1;
        if (inputMap["a"]) direction.z += 1;
        if (inputMap["s"]) direction.x += -1;
        if (inputMap["d"]) direction.z += -1;
        const currentVel = player.physicsImpostor.getLinearVelocity();
        let isMoving = !direction.equals(Vector3.Zero());
        if (isMoving) {
            direction.normalize().scaleInPlace(speed);
            direction.y = currentVel.y;
            player.physicsImpostor.setLinearVelocity(direction);
        } else {
            player.physicsImpostor.setLinearVelocity(new Vector3(0, currentVel.y, 0));
        }
        const playerVel = player.physicsImpostor.getLinearVelocity();
        const movingSpeed = Math.sqrt(playerVel.x ** 2 + playerVel.z ** 2);
        if (dollFacingPlayer && movingSpeed > 0.1) {
            player.material = caughtMaterial;
        } else if (!dollFacingPlayer) {
            player.material = playerMaterial;
        }
    }

    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        other.mesh.position = Vector3.Lerp(other.mesh.position, other.targetPos, 0.2);
    }
});

socket.on("playersUpdate", (playersData) => {
    for (const id in playersData) {
        if (id === socket.id) continue;
        const data = playersData[id];
        let other = otherPlayers[id];
        if (!other) {
            const mesh = MeshBuilder.CreateBox(`player_${id}`, { size: 5 }, scene);
            const mat = new StandardMaterial(`mat_${id}`, scene);
            mat.diffuseColor = Color3.FromHexString(data.color);
            mesh.material = mat;
            mesh.position = new Vector3(data.position.x, data.position.y, data.position.z);
            shadowGenerator.addShadowCaster(mesh);
            otherPlayers[id] = { mesh, targetPos: mesh.position.clone() };
        } else {
            other.targetPos = new Vector3(data.position.x, data.position.y, data.position.z);
            other.mesh.material.diffuseColor = Color3.FromHexString(data.color);
        }
    }

    for (const id in otherPlayers) {
        if (!playersData[id]) {
            otherPlayers[id].mesh.dispose();
            delete otherPlayers[id];
        }
    }
});

function rotateDollToTimeSynced(targetAngle, duration, startTime) {
    const start = performance.now();
    const initial = doll.rotation.y;
    const delta = targetAngle - initial;

    const observer = scene.onBeforeRenderObservable.add(() => {
        const now = performance.now();
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);

        doll.rotation.y = initial + delta * t;

        if (t >= 1) {
            doll.rotation.y = targetAngle;
            dollFacingPlayer = (targetAngle === 0);
            scene.onBeforeRenderObservable.remove(observer);
        }
    });
}

function resizeEngine() {
    engine.setSize(window.innerWidth, window.innerHeight, true);
}

engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", resizeEngine);
resizeEngine();

socket.on("connect", () => {
    createPlayer();
});

socket.on("dollRotate", ({ angle, duration, startTime }) => {
    const timeOffset = Date.now() - performance.now();
    const adjustedStart = startTime - timeOffset;
    const delay = adjustedStart - Date.now();

    setTimeout(() => {
        rotateDollToTimeSynced(angle, duration, adjustedStart);
    }, delay);
});