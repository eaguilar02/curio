import "reactflow/dist/style.css";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import ReactFlow, {
    Background,
    ConnectionMode,
    Controls,
    Edge,
    EdgeChange,
    NodeChange,
    useReactFlow,
} from "reactflow";

import { useFlowContext } from "../providers/FlowProvider";
import { BoxType, EdgeType } from "../constants";
import { getAllNodeTypes } from "../registry";
import UniversalBox from "./UniversalBox";
import { UserMenu } from "./login/UserMenu";
import BiDirectionalEdge from "./edges/BiDirectionalEdge";
import { RightClickMenu } from "./styles";
import { useRightClickMenu } from "../hook/useRightClickMenu";
import { useCode } from "../hook/useCode";
import { ToolsMenu, UpMenu } from "components/menus";
import UniDirectionalEdge from "./edges/UniDirectionalEdge";
import "./MainCanvas.css";
import LLMChat from "./LLMChat";
import { useLLMContext } from "../providers/LLMProvider";
import { TrillGenerator } from "../TrillGenerator";
import html2canvas from "html2canvas";

import FloatingBox from "./FloatingBox";
import WorkflowGoal from "./menus/top/WorkflowGoal";
import { ReplayPage } from "./replay/ReplayPage";
import { PythonInterpreter } from "../PythonInterpreter";

const pythonInterpreter = new PythonInterpreter();

export function MainCanvas() {
    const {
        nodes,
        edges,
        loading,
        onNodesChange,
        onEdgesChange,
        onConnect,
        isValidConnection,
        onEdgesDelete,
        onNodesDelete,
        restoreGraph,
        setDashBoardMode,
        updatePositionWorkflow,
        updatePositionDashboard,
        workflowNameRef,
        workflowGoal,
        applyNewPropagation,
        dashboardPins,
    } = useFlowContext();

    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState<any>(null);
    const [boundingBox, setBoundingBox] = useState<any>(null);
    const [showReplay, setShowReplay] = useState(false);

    useEffect(() => {
        const handleMouseDown = (e: any) => {
            if (e.shiftKey && e.button === 0) {
                setStartPos({ x: e.clientX, y: e.clientY });
                setIsDragging(true);
            }
        };

        const handleMouseMove = (e: any) => {
            if (!isDragging || !startPos) return;

            const currentPos = { x: e.clientX, y: e.clientY };
            setBoundingBox({
                start_x: startPos.x,
                start_y: startPos.y,
                end_x: currentPos.x,
                end_y: startPos.y,
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, startPos, boundingBox]);

    const { onContextMenu, showMenu, menuPosition } = useRightClickMenu();
    const { createCodeNode, outputCallback, interactionsCallback } = useCode();
    const { openAIRequest, AIModeRef, setAIMode } = useLLMContext();

    const nodeTypes = useMemo(() => {
        const types: Record<string, any> = {};

        for (const desc of getAllNodeTypes()) {
            if (desc.adapter) {
                types[desc.id] = UniversalBox;
            }
        }

        return types;
    }, []);

    const edgeTypes = useMemo(() => {
        const types: Record<string, any> = {};
        types[EdgeType.BIDIRECTIONAL_EDGE] = BiDirectionalEdge;
        types[EdgeType.UNIDIRECTIONAL_EDGE] = UniDirectionalEdge;
        return types;
    }, []);

    const reactFlow = useReactFlow();
    const { screenToFlowPosition } = useReactFlow();

    const handleReplayRestore = useCallback((replayNodes: any[], replayEdges: any[]) => {
        const cleanNodes = replayNodes.map((node: any) => {
            const {
                _changed,
                _dimmed,
                selected,
                dragging,
                style,
                ...restNode
            } = node;

            return {
                ...restNode,
                selected: false,
                dragging: false,
                draggable: true,
                selectable: true,
                connectable: true,
                deletable: true,
                data: {
                    ...(restNode.data || {}),

                    _changed: undefined,
                    _dimmed: undefined,
                    _executing: undefined,
                    _execSuccess: undefined,
                    _execError: undefined,
                    _outputPath: undefined,
                    replayMode: undefined,
                    replayChanged: undefined,

                    pythonInterpreter,
                    outputCallback,
                    interactionsCallback,
                    propagationCallback: applyNewPropagation,
                },
            };
        });

        const cleanEdges = replayEdges.map((edge: any) => {
            const {
                _changed,
                selected,
                animated,
                style,
                markerEnd,
                ...restEdge
            } = edge;

            return {
                ...restEdge,
                selected: false,
                animated: false,
                deletable: true,
            };
        });

        restoreGraph(cleanNodes, cleanEdges);
        setShowReplay(false);
    }, [
        restoreGraph,
        outputCallback,
        interactionsCallback,
        applyNewPropagation,
    ]);

    const replayCallbacks = useMemo(() => ({
        outputCallback,
        interactionsCallback,
        propagationCallback: applyNewPropagation,
        pythonInterpreter,
    }), [outputCallback, interactionsCallback, applyNewPropagation]);

    const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
    const [isComponentsSelected, setIsComponentsSelected] = useState<boolean>(false);
    const [floatingBoxes, setFloatingBoxes] = useState<any>({});
    const [selectedComponents, setSelectedComponents] = useState<any>({});
    const [dashboardOn, setDashboardOn] = useState<boolean>(false);

    const captureScreenshot = async (): Promise<string | null> => {
        const screenshotTarget = document.getElementsByClassName("react-flow__renderer")[0] as HTMLElement;

        if (!screenshotTarget) return null;

        return new Promise((resolve) => {
            html2canvas(screenshotTarget).then((canvas) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        resolve(url);
                    } else {
                        resolve(null);
                    }
                });
            });
        });
    };

    const generateExplanation = async (_: React.MouseEvent<HTMLButtonElement>) => {
        const image_url = await captureScreenshot();

        const trill_spec = TrillGenerator.generateTrill(
            selectedComponents.nodes,
            selectedComponents.edges,
            workflowNameRef.current,
            workflowGoal
        );

        const text = JSON.stringify(trill_spec);

        openAIRequest("default_preamble", "explanation_prompt", text)
            .then((response: any) => {
                console.log("Response:", response);

                setFloatingBoxes((prevFloatingBoxes: any) => {
                    const uniqueId = crypto.randomUUID() + "";

                    return {
                        ...prevFloatingBoxes,
                        [uniqueId]: {
                            title: "Explanation from " + workflowNameRef.current,
                            imageUrl: image_url,
                            markdownText: response.result,
                        },
                    };
                });
            })
            .catch((error: any) => {
                console.error("Error:", error);
            });
    };

    const generateDebug = async (_: React.MouseEvent<HTMLButtonElement>) => {
        const image_url = await captureScreenshot();

        const trill_spec = TrillGenerator.generateTrill(
            selectedComponents.nodes,
            selectedComponents.edges,
            workflowNameRef.current,
            workflowGoal
        );

        const text = JSON.stringify(trill_spec) + "\n\n" + "";

        openAIRequest("default_preamble", "debug_prompt", text)
            .then((response: any) => {
                console.log("Response:", response);

                setFloatingBoxes((prevFloatingBoxes: any) => {
                    const uniqueId = crypto.randomUUID() + "";

                    return {
                        ...prevFloatingBoxes,
                        [uniqueId]: {
                            title: "Debugging " + workflowNameRef.current,
                            imageUrl: image_url,
                            markdownText: response.result,
                        },
                    };
                });
            })
            .catch((error: any) => {
                console.error("Error:", error);
            });
    };

    const deleteFloatingBox = (id: string) => {
        setFloatingBoxes((prevFloatingBoxes: any) => {
            const newFloatingBoxes = { ...prevFloatingBoxes };
            delete newFloatingBoxes[id];
            return newFloatingBoxes;
        });
    };

    const handleDashboardToggle = (value: boolean) => {
        setDashboardOn(value);
        setDashBoardMode(value);
    };

    const filteredNodes = useMemo(() => {
        if (!dashboardOn) return nodes;
        return nodes.filter(node => dashboardPins[node.id]);
    }, [nodes, dashboardOn, dashboardPins]);

    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const closeFileMenu = () => setFileMenuOpen(false);

    const loadingAnimation = () => {
        return (
            <div id="plug-loader" role="status" aria-live="polite" aria-busy="true">
                <style>{`
                    #plug-loader {
                        position: fixed;
                        inset: 0;
                        background: #000;
                        display: grid;
                        place-items: center;
                        z-index: 9999;
                    }

                    #plug-loader .spinner {
                        width: 64px;
                        height: 64px;
                        border-radius: 50%;
                        border: 6px solid rgba(255,255,255,0.15);
                        border-top-color: #fff;
                        animation: plug-rotate 0.9s linear infinite;
                    }

                    @keyframes plug-rotate {
                        to { transform: rotate(360deg); }
                    }

                    #plug-loader .sr-only {
                        position: absolute;
                        width: 1px;
                        height: 1px;
                        padding: 0;
                        margin: -1px;
                        overflow: hidden;
                        clip: rect(0,0,1px,1px);
                        white-space: nowrap;
                        border: 0;
                    }
                `}</style>
                <div className="spinner" />
                <span className="sr-only">Loading…</span>
            </div>
        );
    };

    return (
        <>
            {!loading ? (
                <div
                    style={{ width: "100vw", height: "100vh" }}
                    onContextMenu={onContextMenu}
                    onClick={closeFileMenu}
                >
                    {Object.keys(floatingBoxes).map((key) => (
                        <FloatingBox
                            key={key}
                            title={floatingBoxes[key].title}
                            imageUrl={floatingBoxes[key].imageUrl}
                            markdownText={floatingBoxes[key].markdownText}
                            onClose={() => deleteFloatingBox(key)}
                        />
                    ))}

                    <ReactFlow
                        nodes={filteredNodes}
                        edges={edges}
                        onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                            event.preventDefault();

                            const type = event.dataTransfer.getData("application/reactflow") as BoxType;
                            if (!type) return;

                            const position = screenToFlowPosition({
                                x: event.clientX,
                                y: event.clientY,
                            });

                            createCodeNode(type, { position });
                        }}
                        onNodesChange={(changes: NodeChange[]) => {
                            const allowedChanges: NodeChange[] = [];
                            const currentEdges = reactFlow.getEdges();

                            for (const change of changes) {
                                let allowed = true;

                                if (change.type === "remove") {
                                    for (const edge of currentEdges) {
                                        if (
                                            edge.source === change.id ||
                                            edge.target === change.id
                                        ) {
                                            alert(
                                                "Connected boxes cannot be removed. Remove the edges first by selecting it and pressing backspace."
                                            );
                                            allowed = false;
                                            break;
                                        }
                                    }
                                }

                                if (
                                    change.type === "position" &&
                                    change.position !== undefined &&
                                    change.position.x !== undefined
                                ) {
                                    if (dashboardOn) {
                                        updatePositionDashboard(change.id, change);
                                    } else {
                                        updatePositionWorkflow(change.id, change);
                                    }
                                }

                                if (allowed) allowedChanges.push(change);
                            }

                            onNodesDelete(allowedChanges);
                            return onNodesChange(allowedChanges);
                        }}
                        onEdgesChange={(changes: EdgeChange[]) => {
                            let selected = "";
                            const allowedChanges = [];

                            for (const change of changes) {
                                if (change.type === "select" && change.selected === true) {
                                    setSelectedEdgeId(change.id);
                                    selected = change.id;
                                } else if (change.type === "select") {
                                    setSelectedEdgeId("");
                                    selected = "";
                                }
                            }

                            for (const change of changes) {
                                if (
                                    change.type === "remove" &&
                                    (selected === change.id || selectedEdgeId === change.id)
                                ) {
                                    allowedChanges.push(change);
                                } else if (change.type !== "remove") {
                                    allowedChanges.push(change);
                                }
                            }

                            return onEdgesChange(allowedChanges);
                        }}
                        onEdgesDelete={(deletedEdges: Edge[]) => {
                            const allowedEdges: Edge[] = [];

                            for (const edge of deletedEdges) {
                                if (selectedEdgeId === edge.id) {
                                    allowedEdges.push(edge);
                                }
                            }

                            return onEdgesDelete(allowedEdges);
                        }}
                        selectionKeyCode="Shift"
                        onSelectionChange={(selection) => {
                            setSelectedComponents(selection);

                            if (selection.nodes.length + selection.edges.length > 1) {
                                setIsComponentsSelected(true);
                            } else {
                                setIsComponentsSelected(false);
                            }
                        }}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        isValidConnection={isValidConnection}
                        connectionMode={ConnectionMode.Loose}
                        nodesDeletable={true}
                        deleteKeyCode={["Delete", "Backspace"]}
                        minZoom={0.05}
                        fitView
                        attributionPosition="bottom-right"
                    >
                        {AIModeRef.current ? <WorkflowGoal /> : null}
                        <UserMenu />
                        {AIModeRef.current ? <LLMChat /> : null}

                        <UpMenu
                            setDashBoardMode={(value) => handleDashboardToggle(value)}
                            setDashboardOn={handleDashboardToggle}
                            dashboardOn={dashboardOn}
                            fileMenuOpen={fileMenuOpen}
                            setFileMenuOpen={setFileMenuOpen}
                            setAIMode={setAIMode}
                            replayOpen={showReplay}
                        />

                        <RightClickMenu
                            showMenu={showMenu}
                            menuPosition={menuPosition}
                            options={[
                                {
                                    name: "Add comment box",
                                    action: () => createCodeNode("COMMENTS"),
                                },
                            ]}
                        />

                        <Background style={{ zIndex: -1 }} />
                        <Controls style={{ bottom: "60px" }} />

                        {isComponentsSelected && (
                            <button
                                id="explainButton"
                                style={{
                                    bottom: "50px",
                                    left: "30%",
                                    position: "absolute",
                                    zIndex: 10,
                                    padding: "8px 16px",
                                    backgroundColor: "#007bff",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                }}
                                onClick={generateExplanation}
                            >
                                Explain
                            </button>
                        )}

                        {isComponentsSelected && (
                            <button
                                style={{
                                    bottom: "50px",
                                    left: "40%",
                                    position: "absolute",
                                    zIndex: 10,
                                    padding: "8px 16px",
                                    backgroundColor: "#007bff",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                }}
                                onClick={generateDebug}
                            >
                                Debug
                            </button>
                        )}
                    </ReactFlow>

                    {showReplay && (
                        <div
                            style={{
                                position: "fixed",
                                top: "65px",
                                left: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 1002,
                                background: "rgba(0, 0, 0, 0.42)",
                                pointerEvents: "all",
                            }}
                        >
                            <ReplayPage
                                onRestore={handleReplayRestore}
                                onClose={() => setShowReplay(false)}
                                replayCallbacks={replayCallbacks}
                            />
                        </div>
                    )}

                    {!showReplay && (
                        <button
                            onClick={() => setShowReplay(true)}
                            title="Open replay"
                            style={{
                                position: "fixed",
                                left: "16px",
                                bottom: "18px",
                                zIndex: 2100,
                                padding: "10px 18px",
                                background: "#1E1F23",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontSize: "15px",
                                fontWeight: 800,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                                transition: "all 0.15s ease",
                                minHeight: "40px",
                            }}
                        >
                            Replay
                        </button>
                    )}

                    <ToolsMenu replayOpen={showReplay} />
                    <input hidden type="file" name="file" id="file" />
                </div>
            ) : (
                loadingAnimation()
            )}
        </>
    );
}