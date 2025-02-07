import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Message = {
  roomId: string;
  message: string;
  sender: string; // Add sender information
  userId?: string; // Add userId
};

function Rooms() {
  const [mySocket, setMySocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRoomID, setActiveRoomId] = useState<string | null>(null); // Store as string
  const [message, setMessage] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [usersTyping, setUsersTyping] = useState<string[]>([]);
  const [roomList, setRoomList] = useState<{
    [key: string]: { name: string; messages: Message[] };
  }>({});
  const messageListRef = useRef<HTMLDivElement>(null);
  const [joiningMessage, setJoiningMessage] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>("");

  useEffect(() => {
    const socket = io("http://localhost:3001", { transports: ["websocket"] }); // Use http://

    setMySocket(socket);

    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("roomMessage", (data: Message) => {
      setMessages((prevMessages) => [...prevMessages, data]);
    });

    socket.on("joiningMessage", (data: Message) => {
      setJoiningMessage(`${data.userId} ${data.message}`);
      setTimeout(() => {
        setJoiningMessage(null);
      }, 5000); // Clear message after 5 seconds
    });

    socket.on("roomHistory", (history: Message[]) => {
      setMessages(history); // Display initial messages
    });

    socket.on("leavingMessage", (data: Message) => {
      setJoiningMessage(`${data.userId} ${data.message}`);
      setTimeout(() => {
        setJoiningMessage(null);
      }, 5000); // Clear message after 5 seconds
    });

    socket.on("typing", (userId: string) => {
      setUsersTyping((prevUsers) => [...prevUsers, userId]);
    });

    socket.on("stopTyping", (userId: string) => {
      setUsersTyping((prevUsers) => prevUsers.filter((id) => id !== userId));
    });

    socket.on("roomList", (rooms) => {
      setRoomList(rooms);
    });

    socket.on("error-from-server", (error) => {
      console.error("Server Error:", error);
      alert(error); // Display error message
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  function joinRoomExclusively(roomId: string) {
    if (!mySocket) return;

    setActiveRoomId(roomId);
    setMessages(roomList[roomId]?.messages || []);
    mySocket.emit("joinRoomExclusively", {
      roomId,
      text: "has joined the room",
    });
  }

  function sendMessage() {
    if (!mySocket || !activeRoomID || !message) return;

    mySocket.emit(
      "sendMessage",
      {
        roomId: activeRoomID,
        message,
        sender: "User", // Add sender info
      },
      (ack: string) => {
        console.log(ack); // Message delivered
      }
    );
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
      (roomId: string, roomName: string) => {
        setRoomList((prevRooms) => ({
          ...prevRooms,
          [roomId]: { name: roomName, messages: [] },
        }));
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
        setRoomList((prevRooms) => ({
          ...prevRooms,
          [roomId]: { ...prevRooms[roomId], name: updatedName },
        }));
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
        setRoomList((prevRooms) => {
          const updatedRooms = { ...prevRooms };
          delete updatedRooms[deletedRoomId];
          return updatedRooms;
        });
      }
    );
  }

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
            className='w-full bg-rose-500 hover:bg-rose-700 text-white font-bold py-2 px-4 rounded'
            onClick={createRoom}
          >
            Create Room
          </button>
        </div>
        {Object.entries(roomList).map(([roomId, room]) => (
          <div key={roomId} className='mb-2 p-2 rounded bg-gray-700'>
            <div className='flex justify-between items-center'>
              <div
                className='cursor-pointer'
                onClick={() => joinRoomExclusively(roomId)}
              >
                {room.name}
              </div>
              <div className='flex gap-2'>
                <button
                  className='text-blue-400'
                  onClick={() => {
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
                  onClick={() => {
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
                  msg.sender === "User"
                    ? "bg-blue-500 text-white ml-auto"
                    : "bg-gray-700 text-white mr-auto"
                }`}
              >
                <div className='font-semibold'>{msg.sender}</div>
                <div>{msg.message}</div>
              </div>
            ))}
            {usersTyping.length > 0 && (
              <div className='text-gray-400'>
                {usersTyping.map((userId, i) => (
                  <div key={i}>User {userId} is typing...</div>
                ))}
              </div>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <textarea
              className='flex-grow p-2 border rounded-md focus:ring focus:ring-rose-300 bg-gray-800 text-white'
              rows={3}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                handleTyping();
              }}
              placeholder='Type your message...'
            />
            <button
              className='bg-rose-500 hover:bg-rose-700 text-white font-bold py-2 px-4 rounded'
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

export default Rooms;
