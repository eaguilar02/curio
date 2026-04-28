import React, { useState, useRef, useEffect } from "react";
import CSS from "csstype";
import { FileUpload, TrillProvenanceWindow, DatasetsWindow, Expand } from "components/menus";
import { useFlowContext } from "../../../providers/FlowProvider";
import { useCode } from "../../../hook/useCode";
import { useLogging } from "../../../logging/LoggingContext";

const API = 'http://localhost:5002';
import { TrillGenerator } from "../../../TrillGenerator";
import styles from "./UpMenu.module.css";
import clsx from 'clsx';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faFileImport, faFileExport } from "@fortawesome/free-solid-svg-icons";
import logo from 'assets/curio.png';
import introJs from 'intro.js';//new import
import "intro.js/introjs.css";//this too

export default function UpMenu({
    setDashBoardMode,
    setDashboardOn,
    dashboardOn,
    fileMenuOpen,
    setFileMenuOpen,
    setAIMode,
    replayOpen = false,
}: {
    setDashBoardMode: (mode: boolean) => void;
    setDashboardOn: (mode: boolean) => void;
    dashboardOn: boolean;
    fileMenuOpen: boolean;
    setAIMode: (value: boolean) => void;
    setFileMenuOpen: (open: boolean) => void;
    replayOpen?: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [trillProvenanceOpen, setTrillProvenanceOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [datasetsOpen, setDatasetsOpen] = useState(false);
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [saveAsConflict, setSaveAsConflict] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { nodes, edges, workflowNameRef, setWorkflowName } = useFlowContext();
    const { loadTrill } = useCode();
    const { startNewSession } = useLogging();

    const fileButtonRef = useRef<HTMLButtonElement>(null);

    const closeTrillProvenanceModal = () => {
        setTrillProvenanceOpen(false);
    }

    const openTrillProvenanceModal = () => {
        setTrillProvenanceOpen(true);
    }

    const closeDatasetsModal = () => {
        setDatasetsOpen(false);
    }

    const openDatasetsModal = () => {
        setDatasetsOpen(true);
    }
    
    const handleNameChange = (e: any) => {
        setWorkflowName(e.target.value);
    };

    const handleNameBlur = () => {
        setIsEditing(false);
    };

    const handleKeyPress = (e: any) => {
        if (e.key === "Enter") {
            setIsEditing(false);
        }
    };
    //James new defintions made here

    const closeTutorial = () => {
        setTutorialOpen(false);
    }

    const openTutorial = () => {
        setTutorialOpen(true);
    }

    //James new defintions end

    const openSaveAs = () => {
        setSaveAsName(workflowNameRef.current);
        setSaveAsConflict(false);
        setSaveAsOpen(true);
        setFileMenuOpen(false);
    };

    const confirmSaveAs = async (override: boolean) => {
        const name = saveAsName.trim();
        if (!name) return;

        if (override) {
            await fetch(`${API}/api/log/sessions/archive-by-name`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ workflow_name: name }),
            }).catch(() => {});
        }

        setWorkflowName(name);
        await startNewSession(name);
        setSaveAsOpen(false);
        setSaveAsConflict(false);
    };

    const handleSaveAsSubmit = async () => {
        const name = saveAsName.trim();
        if (!name) return;

        // Check if name already exists
        const res  = await fetch(`${API}/api/log/sessions?limit=200`).catch(() => null);
        const data = res ? await res.json() : { sessions: [] };
        const exists = (data.sessions ?? []).some(
            (s: any) => s.workflow_name === name
        );

        if (exists) {
            setSaveAsConflict(true);
        } else {
            confirmSaveAs(false);
        }
    };

    const exportTrill = (e:any) => {
        let trill_spec = TrillGenerator.generateTrill(nodes, edges, workflowNameRef.current);
        
        const jsonString = JSON.stringify(trill_spec, null, 2);

        const blob = new Blob([jsonString], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = workflowNameRef.current+'.json';

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);
    }

    const handleFileUpload = (e:any) => {
        const file = e.target.files[0]; // Get the selected file

        if (file && file.type === 'application/json') {
            const reader = new FileReader();
    
            reader.onload = (e:any) => {
                try {
                    const jsonContent = JSON.parse(e.target.result);

                    console.log('Uploaded JSON content:', jsonContent);
                    loadTrill(jsonContent);
                } catch (err) {
                    console.error('Invalid JSON file:', err);
                }
            };
    
            reader.onerror = (e:any) => {
                console.error('Error reading file:', e.target.error);
            };
    
            reader.readAsText(file);
        } else {
            console.error('Please select a valid .json file.');
        }
    }

    const loadTrillFile = (e:any) => {
        const fileInput = document.getElementById('loadTrill') as HTMLElement;
        fileInput.click();
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            //     console.log("set file menu open to false");
            //     setFileMenuOpen(false);
            // }
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                fileButtonRef.current &&
                !fileButtonRef.current.contains(event.target as Node)
            ) {
                setFileMenuOpen(false);
            }
        };
    
        if (fileMenuOpen) {
            document.addEventListener("click", handleClickOutside);
        } else {
            document.removeEventListener("click", handleClickOutside);
        }
    
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    }, [fileMenuOpen]);

    //New code here James

     useEffect(() => {
        if(tutorialOpen){
            const intro = introJs();

        intro.setOptions({
            steps: [
        {
            intro: "Welcome to Curio, a framework for urban analytics. Let's take a quick tour to help you get started."
        },
        {
          element: '#step-loading',  
          intro: "This is a Data Loading Node. Here, you can create an array for basic datasets or import data from a file. Once loaded, add your code to convert the data into a DataFrame for further analysis."
        },
        {
          element: '#step-analysis',  
          intro: "This is a Data Analysis Node. Use it to perform calculations and operations on your dataset, preparing it for visualization."
        },
        {
          element: '#step-transformation',  
          intro: "The Data Transformation Node allows you to filter, segment, or restructure your data."
        },
        {
          element: '#step-cleaning',  
          intro: "This is a Data Cleaning Node. Use it to refine your dataset by handling missing values, removing outliers, and generating identifiers for data quality purposes."
        },
        {
          element: '#step-pool',  
          intro: "This is a Data Pool Node. It enables you to display your processed data in a structured grid format for easy review."
        },
        {
          element: '#step-utk',  
          intro: "This is a UTK Node. It renders your data in an interactive 3D environment using UTK."
        },
        {
          element: '#step-vega',  
          intro: "This is a Vega-Lite Node. Use it to visualize data in 2D formats (bar charts, scatter plots, and line graphs) using a JSON specification."
        },
        {
          element: '#step-image',  
          intro: "The Image Node displays a gallery of images."
        },
        {
          element: '#step-merge',  
          intro: "This is a Merge Flow Node. It allows you to combine multiple data streams into a single dataset. Red handles indicate a missing connection, while green handles show that a connection has been established. Note: each handle can only connect to one edge."
        },
        {
          element: '#step-final',  
          intro: "That's it! Drag and drop nodes into your workspace and begin exploring your data with Curio."
        }
        ],
        
        showStepNumbers: false,
        showProgress: false,
        exitOnOverlayClick: false,
        tooltipClass: "custom-intro-tooltip" ,
    });
        intro.start();
        setTutorialOpen(false);
        }
    }, [tutorialOpen]);

    //new code end

    return (
        <>
            <div className={clsx(styles.menuBar, "nowheel", "nodrag")}>
                <img className={styles.logo} src={logo} alt="Curio logo"/>
                <div className={styles.dropdownWrapper}>
                    <button
                        ref={fileButtonRef}
                        className={styles.button}
                        onClick={(e) => {
                                e.stopPropagation();
                                setFileMenuOpen(!fileMenuOpen);
                            }
                        }
                    >
                        File⏷
                    </button>
                    {fileMenuOpen && (
                        <div className={styles.dropDownMenu} ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.dropDownRow} onClick={loadTrillFile} >
                                <FontAwesomeIcon className={styles.dropDownIcon} icon={faFileImport} />
                                <button className={styles.noStyleButton}>Load specification</button>
                                <input type="file" accept=".json" id="loadTrill" style={{ display: 'none' }} onChange={handleFileUpload}/>
                            </div>
                            <div className={styles.dropDownRow} onClick={exportTrill}>
                                <FontAwesomeIcon className={styles.dropDownIcon} icon={faFileExport} />
                                <button className={styles.noStyleButton}>Save specification</button>
                            </div>
                            <div className={styles.dropDownRow} onClick={openSaveAs}>
                                <FontAwesomeIcon className={styles.dropDownIcon} icon={faFileExport} />
                                <button className={styles.noStyleButton}>Save As...</button>
                            </div>
                        </div>
                    )}
                </div>
                <button   
                    className={clsx(
                        styles.button,
                        dashboardOn ? styles.dashboardOn : styles.dashboardOff
                    )}
                    onClick={() => {setDashBoardMode(!dashboardOn); setDashboardOn(!dashboardOn);}}>
                        Dashboard Mode
                </button>
                <button className={styles.button} onClick={openTrillProvenanceModal}>Provenance</button>
                <button className={styles.button} onClick={openTutorial}>Tutorial</button>
                <span className={styles.aiToggleText}>Urbanite</span>
                <div className="form-check form-switch">
                    <input className={`form-check-input ${styles.aiToggleSwitch}`} type="checkbox" role="switch" id="flexSwitchCheckChecked" onChange={(e: any) => {setAIMode(e.target.checked)}}></input>
                </div>
            </div>
            {/* Right-side top menu */}
            <div className={styles.rightSide}>
                <Expand />
                <FileUpload />
                <button className={styles.button} onClick={openDatasetsModal}><FontAwesomeIcon icon={faDatabase} /></button>
            </div>
            {/* Editable Workflow Name */}
            <div className={styles.workflowNameContainer} style={{ top: replayOpen ? '90px' : undefined }}>
                {isEditing ? (
                    <input
                        type="text"
                        value={workflowNameRef.current}
                        onChange={handleNameChange}
                        onBlur={handleNameBlur}
                        onKeyPress={handleKeyPress}
                        autoFocus
                        className={styles.input}
                    />
                ) : (
                    <h1
                        className={styles.workflowNameStyle}
                        onClick={() => setIsEditing(true)}
                    >
                        {workflowNameRef.current}
                    </h1>
                )}
            </div>
            {/* Trill Provenance Modal */}
            <TrillProvenanceWindow 
                open={trillProvenanceOpen}
                closeModal={closeTrillProvenanceModal}
                workflowName={workflowNameRef.current}
            />
            {/* Datasets Modal */}
            <DatasetsWindow
                open={datasetsOpen}
                closeModal={closeDatasetsModal}
            />

            {/* Save As Dialog */}
            {saveAsOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 10, padding: '28px 32px',
                        minWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', gap: 16,
                    }}>
                        {!saveAsConflict ? (
                            <>
                                <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Save As...</h3>
                                <input
                                    autoFocus
                                    value={saveAsName}
                                    onChange={e => setSaveAsName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSaveAsSubmit()}
                                    placeholder="Session name"
                                    style={{
                                        padding: '8px 12px', borderRadius: 6, fontSize: 14,
                                        border: '1.5px solid #cbd5e1', outline: 'none',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setSaveAsOpen(false)}
                                        style={{ padding: '6px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                    <button onClick={handleSaveAsSubmit}
                                        style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                                        Save
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Session already exists</h3>
                                <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
                                    A session named <strong>"{saveAsName}"</strong> already exists.<br />
                                    Do you want to override it or keep both?
                                </p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setSaveAsOpen(false)}
                                        style={{ padding: '6px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                    <button onClick={() => confirmSaveAs(false)}
                                        style={{ padding: '6px 18px', borderRadius: 6, border: '1px solid #1e3a5f', background: '#fff', color: '#1e3a5f', cursor: 'pointer', fontWeight: 700 }}>
                                        Keep Both
                                    </button>
                                    <button onClick={() => confirmSaveAs(true)}
                                        style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                                        Override
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>

    );
}