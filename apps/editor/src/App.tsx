/**
 * Main Editor Application
 */

import React, { useEffect, useRef } from 'react';
import { World, type Entity } from '@tsumiki/utsutsu';
import { BabylonRenderer } from '@tsumiki/ukiyoe';
import { SceneBuilder } from '@tsumiki/builder';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(new World());
  const rendererRef = useRef<BabylonRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize renderer
    const renderer = new BabylonRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.start();

    return () => {
      renderer.stop();
      renderer.dispose();
    };
  }, []);

  const handleBuild = async () => {
    const builder = new SceneBuilder();
    const world = worldRef.current;
    
    // Get entities from the world
    const entities = Array.from((world as any).entities?.values() ?? []) as Entity[];
    
    const sceneData = {
      entities,
      metadata: {
        name: 'Test Scene',
        version: '1.0.0',
        created: new Date().toISOString(),
      },
    };
    
    const result = await builder.build(sceneData);
    console.log('Build result:', result);
  };

  return (
    <div className="editor">
      <header className="editor-header">
        <h1>Tsumiki Editor</h1>
        <button onClick={handleBuild}>Build Scene</button>
      </header>
      <div className="editor-content">
        <aside className="editor-sidebar">
          <h2>Hierarchy</h2>
          <p>Scene entities will appear here</p>
        </aside>
        <main className="editor-viewport">
          <canvas ref={canvasRef} />
        </main>
        <aside className="editor-properties">
          <h2>Properties</h2>
          <p>Entity properties will appear here</p>
        </aside>
      </div>
    </div>
  );
};
