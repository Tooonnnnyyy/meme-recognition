import React, { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { stations, step } from './controls'
function Box({ at, size, color, ...rest }) { return <mesh position={at} castShadow receiveShadow {...rest}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.65}/></mesh> }
function Player({ world, controls, active, onNear, onInteract }) {
  const body=useRef(), legs=useRef(), last=useRef(-2)
  useFrame(({ clock }, dt) => {
    const c=controls.current, k=c.keys
    const input= active.current ? { x:k.has('KeyD')?1:k.has('KeyA')?-1:c.hand.x, z:k.has('KeyS')?1:k.has('KeyW')?-1:c.hand.z, jump:c.jump } : {x:0,z:0,jump:false}
    step(world,input,dt); c.jump=false
    if (c.interact && active.current && world.nearby>=0) onInteract(world.nearby)
    c.interact=false
    body.current.position.set(world.x,world.y,world.z); body.current.rotation.y=world.yaw
    legs.current.rotation.x=world.moving?Math.sin(clock.elapsedTime*13)*.22:0
    if(last.current!==world.nearby) { last.current=world.nearby; onNear(world.nearby) }
  })
  return <group ref={body}><Box at={[0,.9,0]} size={[.55,.7,.35]} color="#e3fa6d"/><mesh position={[0,1.48,0]} castShadow><sphereGeometry args={[.26,20,16]}/><meshStandardMaterial color="#ecbb9c"/></mesh><Box at={[0,1.53,.23]} size={[.34,.1,.07]} color="#18352e"/><group ref={legs}><Box at={[-.16,.3,0]} size={[.21,.5,.25]} color="#223e39"/><Box at={[.16,.3,0]} size={[.21,.5,.25]} color="#223e39"/></group><Box at={[-.38,.9,0]} size={[.15,.6,.2]} color="#ecbb9c"/><Box at={[.38,.9,0]} size={[.15,.6,.2]} color="#ecbb9c"/></group>
}
function Room() {
  return <><color attach="background" args={['#102822']}/><fog attach="fog" args={['#102822',26,55]}/><ambientLight intensity={1.3}/><directionalLight position={[-5,12,7]} intensity={2.5} castShadow shadow-mapSize={[2048,2048]}/><hemisphereLight args={['#deffdf','#3f4a39',1]}/>
  <Box at={[0,-.2,0]} size={[18,.4,18]} color="#bfd0b2"/>
  <gridHelper args={[18,18,'#9bad91','#afc1a3']} position={[0,.015,0]}/>
  <Box at={[0,1.5,-9]} size={[18,3,.3]} color="#557461"/>
  <Box at={[-9,.6,0]} size={[.3,1.2,18]} color="#557461"/>
  <Box at={[9,.6,0]} size={[.3,1.2,18]} color="#557461"/>
  {[-6,-2,2,6].map(x=><Box key={x} at={[x,2,-8.8]} size={[2.8,1.3,.06]} color="#d1edc8"/>)}
  <Box at={[0,.025,1]} size={[3,.03,13]} color="#e2e7c6"/>
  {stations.map((s,i)=><group key={s.title} position={[s.x,0,s.z]}><Box at={[0,.65,0]} size={[1.9,1.3,1]} color={['#e88e6e','#dceca0','#88bbc0'][i]}/><Box at={[0,1.35,0]} size={[2.2,.12,1.3]} color="#f4edce"/><Box at={[0,1.85,-.1]} size={[1.1,.75,.1]} color="#173b32"/><mesh position={[0,2.75,0]} rotation={[.4,0,.7]}><octahedronGeometry args={[.28]}/><meshStandardMaterial color="#e5fa6e" emissive="#bbd45d" emissiveIntensity={.5}/></mesh></group>)}
  {[-1,1].map(side=><group key={side}><Box at={[side*6,.3,3]} size={[2,.6,3.2]} color="#db936f"/><Box at={[side*6.75,.85,3]} size={[.4,1.1,3.2]} color="#b87253"/><Box at={[side*4.3,.4,3]} size={[1,.8,1.4]} color="#f0e6bf"/></group>)}
  </>
}
export function Scene(props) { return <Canvas shadows camera={{position:[0,16,18],fov:48}} dpr={[1,1.5]} onCreated={({camera})=>camera.lookAt(0,0,-1)}><Room/><Player {...props}/></Canvas> }
