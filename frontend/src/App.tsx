import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Message = {
  roomId?: string;
  message: string;
  sender: string; // Add sender information
  userId?: string; // Add userId
  recipientId?: string; // For private messages
};

function App() {
  const [mySocket, setMySocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Message[]>([]);
  const [activeRoomID, setActiveRoomId] = useState<string | null>(null); // Store as string
  const [message, setMessage] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [usersTyping, setUsersTyping] = useState<
    { userId: string; username: string }[]
  >([]);
  const [roomList, setRoomList] = useState<{
    [key: string]: { name: string; messages: Message[] };
  }>({});
  const [roomMemberCount, setRoomMemberCount] = useState<number>(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [joiningMessage, setJoiningMessage] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>("");
  const [username, setUsername] = useState<string>(
    localStorage.getItem("username") || ""
  );

  useEffect(() => {
    const socket = io("http://localhost:3001", { transports: ["websocket"] }); // Use http://

    setMySocket(socket);

    socket.on("connect", () => {
      console.log("Connected to server");
      socket.emit("setUsername", username);
    });

    socket.on("roomMessage", (data: Message) => {
      setMessages((prevMessages) => [...prevMessages, data]);
    });

    socket.on("privateMessage", (data: Message) => {
      setPrivateMessages((prevMessages) => [...prevMessages, data]);
    });

    socket.on("joiningMessage", (data: Message) => {
      const sender = data.sender || "Unknown";
      const message = data.message || "joined the room";
      setJoiningMessage(`${sender} ${message}`);
      setTimeout(() => {
        setJoiningMessage(null);
      }, 5000); // Clear message after 5 seconds
    });

    socket.on("welcomeMessage", (welcomeMsg: string) => {
      setJoiningMessage(welcomeMsg);
      setTimeout(() => {
        setJoiningMessage(null);
      }, 5000);
    });

    socket.on("roomHistory", (history: Message[]) => {
      setMessages(history); // Display initial messages
    });

    socket.on("leavingMessage", (data: Message) => {
      const sender = data.sender || "Unknown";
      const message = data.message || "left the room";
      setJoiningMessage(`${sender} ${message}`);
      setTimeout(() => {
        setJoiningMessage(null);
      }, 5000); // Clear message after 5 seconds
    });

    socket.on("typing", (data: { userId: string; username: string }) => {
      setUsersTyping((prevUsers) => [...prevUsers, data]);
    });

    socket.on("stopTyping", (userId: string) => {
      setUsersTyping((prevUsers) =>
        prevUsers.filter((user) => user.userId !== userId)
      );
    });

    socket.on("roomList", (rooms) => {
      setRoomList(rooms);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    socket.on("userList", (users) => {
      // Handle user list update if needed
    });

    socket.on("roomMemberCount", (count) => {
      setRoomMemberCount(count);
    });

    socket.on("error-from-server", (error) => {
      console.error("Server Error:", error);
      alert(error); // Display error message
    });

    return () => {
      socket.disconnect();
    };
  }, [username]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, privateMessages]);

  function joinRoomExclusively(roomId: string) {
    if (!mySocket) return;

    setActiveRoomId(roomId);
    setMessages(roomList[roomId]?.messages || []);
    mySocket.emit("joinRoomExclusively", {
      roomId,
      text: "has joined the room",
      username: username || "Anonymous",
    });
  }

  function sendMessage() {
    if (!mySocket || !message) return;

    if (activeRoomID) {
      mySocket.emit(
        "sendMessage",
        {
          roomId: activeRoomID,
          message,
          sender: username || "Anonymous", // Add sender info
        },
        (ack: string) => {
          console.log(ack); // Message delivered
        }
      );
    } else {
      // Sending a private message (assuming recipientId is set)
      const recipientId = prompt("Enter recipient ID for private message:");
      if (recipientId) {
        mySocket.emit(
          "sendMessage",
          {
            message,
            sender: username || "Anonymous",
            recipientId,
          },
          (ack: string) => {
            console.log(ack); // Message delivered
          }
        );
      }
    }
    setMessage("");
  }

  function handleTyping() {
    if (!mySocket || !activeRoomID) return;

    if (!isTyping) {
      setIsTyping(true);
      mySocket.emit("typing", activeRoomID);
    }

    setTimeout(() => {
      setIsTyping(false);
      mySocket.emit("stopTyping", activeRoomID);
    }, 3000); // Stop typing after 3 seconds of inactivity
  }

  function createRoom() {
    if (!mySocket || !roomName) return;

    mySocket.emit(
      "createRoom",
      roomName,
      (error: string | null, roomId: string, roomName: string) => {
        if (error) {
          alert(error);
          return;
        }
        const newRoomList = {
          ...roomList,
          [roomId]: { name: roomName, messages: [] },
        };
        setRoomList(newRoomList);
        localStorage.setItem("rooms", JSON.stringify(newRoomList));
        setRoomName("");
      }
    );
  }

  function updateRoomName(roomId: string, newRoomName: string) {
    if (!mySocket) return;

    mySocket.emit(
      "updateRoomName",
      roomId,
      newRoomName,
      (error: string | null, updatedName: string) => {
        if (error) {
          console.error(error);
          return;
        }
        const updatedRoomList = {
          ...roomList,
          [roomId]: { ...roomList[roomId], name: updatedName },
        };
        setRoomList(updatedRoomList);
        localStorage.setItem("rooms", JSON.stringify(updatedRoomList));
      }
    );
  }

  function deleteRoom(roomId: string) {
    if (!mySocket) return;

    mySocket.emit(
      "deleteRoom",
      roomId,
      (error: string | null, deletedRoomId: string) => {
        if (error) {
          console.error(error);
          return;
        }
        const updatedRoomList = { ...roomList };
        delete updatedRoomList[deletedRoomId];
        setRoomList(updatedRoomList);
        localStorage.setItem("rooms", JSON.stringify(updatedRoomList));
      }
    );
  }

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newUsername = e.target.value;
    setUsername(newUsername);
    localStorage.setItem("username", newUsername);
    if (mySocket) {
      mySocket.emit("setUsername", newUsername);
    }
  }

  useEffect(() => {
    const storedRooms = localStorage.getItem("rooms");
    if (storedRooms) {
      setRoomList(JSON.parse(storedRooms));
    }
  }, []);

  return (
    <div className='grid grid-cols-12 h-screen bg-gray-900 text-white'>
      <aside className='col-span-3 h-screen overflow-y-auto p-4 bg-gray-800'>
        <h1 className='text-xl font-semibold mb-4'>Rooms</h1>
        <div className='mb-4'>
          <input
            className='w-full p-2 mb-2 text-gray-900 rounded-md'
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder='Enter room name'
          />
          <button
            className='w-full bg-blue-900 hover:bg-blue-900 text-white font-bold py-2 px-4 rounded'
            onClick={createRoom}
          >
            Create Room
          </button>
        </div>
        <div className='mb-4'>
          <label className='block mb-2'>Your Name:</label>
          <input
            className='w-full p-2 text-gray-900 rounded-md'
            value={username}
            onChange={handleUsernameChange}
            placeholder='Enter your name'
          />
        </div>
        {Object.entries(roomList).map(([roomId, room]) => (
          <div
            key={roomId}
            className={`mb-2 p-2 rounded cursor-pointer ${
              activeRoomID === roomId ? "bg-blue-900 text-white" : "bg-gray-700"
            }`}
            onClick={() => joinRoomExclusively(roomId)}
          >
            {room.name}
            <div className='flex justify-between items-center'>
              <div className='flex gap-2'>
                <button
                  className='text-blue-400'
                  onClick={(e) => {
                    e.stopPropagation();
                    const newRoomName = prompt(
                      "Enter new room name:",
                      room.name
                    );
                    if (newRoomName) {
                      updateRoomName(roomId, newRoomName);
                    }
                  }}
                >
                  Rename
                </button>
                <button
                  className='text-red-400'
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      window.confirm(
                        "Are you sure you want to delete this room?"
                      )
                    ) {
                      deleteRoom(roomId);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </aside>
      <main className='col-span-9 bg-gray-900 p-4'>
        <div className='flex flex-col h-full'>
          {activeRoomID && (
            <div className='mb-4'>
              <h2 className='text-2xl font-bold'>
                {roomList[activeRoomID]?.name}
              </h2>
              <p className='text-sm text-gray-400'>
                Members: {roomMemberCount}
              </p>
            </div>
          )}
          <div
            className='flex-grow overflow-y-auto mb-4 p-2'
            ref={messageListRef}
          >
            {joiningMessage && (
              <div className='text-green-500 mb-2'>{joiningMessage}</div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-2 p-2 rounded ${
                  msg.sender === username
                    ? "bg-blue-500 text-white ml-auto"
                    : "bg-gray-700 text-white mr-auto"
                }`}
              >
                <div className='font-semibold'>{msg.sender}</div>
                <div>{msg.message}</div>
              </div>
            ))}
            {privateMessages.map((msg, i) => (
              <div
                key={i}
                className={`mb-2 p-2 rounded ${
                  msg.sender === username
                    ? "bg-green-500 text-white ml-auto"
                    : "bg-gray-700 text-white mr-auto"
                }`}
              >
                <div className='font-semibold'>{msg.sender}</div>
                <div>{msg.message}</div>
              </div>
            ))}
            {usersTyping.length > 0 && (
              <div className='text-gray-400'>
                {usersTyping.map((user, i) => (
                  <div key={i}>{user.username} is typing...</div>
                ))}
              </div>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <textarea
              className='flex-grow p-2 border rounded-md focus:ring focus:ring-blue-900 bg-gray-800 text-white'
              rows={3}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                handleTyping();
              }}
              placeholder='Type your message...'
            />
            <button
              className='bg-blue-900 hover:bg-blue-900 text-white font-bold py-2 px-4 rounded'
              onClick={sendMessage}
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
